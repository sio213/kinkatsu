import { DesignIcon, type DesignIconName } from '@/components/ui/design-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Typography } from '@/constants/theme';
import { useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
// トリガーとメニューの間の余白。下に開く場合の上マージン・上に開く場合の下マージンの両方に使う
const MENU_GAP = 4;

type Anchor = { x: number; y: number; width: number; height: number };

// トリガーのアンカーとメニュー自身の高さから配置スタイルを決める純粋関数。ネイティブの
// measureInWindow/onLayoutから独立させることで、実機無しでも位置決めロジック単体をテストできる
export function computeMenuPositionStyle(
  anchor: Anchor,
  menuHeight: number | null,
  minWidth: number,
): { minWidth: number; top: number; right: number; bottom?: undefined } | { minWidth: number; bottom: number; right: number; top?: undefined } {
  const spaceBelow = SCREEN_HEIGHT - (anchor.y + anchor.height);
  const opensUpward = menuHeight != null && menuHeight + MENU_GAP > spaceBelow;
  const right = SCREEN_WIDTH - (anchor.x + anchor.width);

  // 上開きになるのはトリガーが画面下部にある時だけなので、上方の余白は常に十分にある前提。
  // メニューが今より大幅に長くなる場合は上端はみ出しのクランプが別途必要になる
  return opensUpward
    ? { minWidth, bottom: SCREEN_HEIGHT - anchor.y + MENU_GAP, right }
    : { minWidth, top: anchor.y + anchor.height + MENU_GAP, right };
}

type DropdownMenuItemBase = {
  key: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
};

// 通常のアクション項目（アイコン付き）
type DropdownMenuActionItem = DropdownMenuItemBase & { icon: DesignIconName; danger?: boolean };
// チェックマーク付きの単一選択項目（並び替えメニューの選択肢など）
type DropdownMenuRadioItem = DropdownMenuItemBase & { selected: boolean };

export type DropdownMenuItem = DropdownMenuActionItem | DropdownMenuRadioItem;

type Props = {
  // 区切り線で分けたいグループごとに配列を分ける。区切りが不要なら1グループにまとめる
  groups: DropdownMenuItem[][];
  renderTrigger: (state: { open: boolean; onPress: () => void }) => ReactNode;
  minWidth?: number;
  backdropTestID?: string;
};

// ⋮メニュー・並び替えメニューなど「トリガーを押すと画面上にオーバーレイのメニューが開く」UIの共通実装。
// Modal+measureInWindowでトリガーのアンカー位置に絶対配置し、開閉のたびに背後のレイアウトが
// ガタつかないようにする。トリガーが画面下部にあり、下に開くと画面外にはみ出す場合は
// 自動的にトリガーの上に開き直す（実機で「カードが下にある時⋮メニューが画面外に出て操作できない」
// バグの回帰防止）
export function DropdownMenu({ groups, renderTrigger, minWidth = 160, backdropTestID }: Props) {
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // メニュー自体の実際の高さ。中身（項目数）依存で開くたびに変わりうるため、開く度に測り直す。
  // nullの間は「まだ上下どちらに開くか決まっていない」状態を表す
  const [menuHeight, setMenuHeight] = useState<number | null>(null);
  const open = anchor !== null;

  const handleOpen = () => {
    // 検索欄・数値入力欄にフォーカスが残ったまま開くとキーボードが出しっぱなしになるため、
    // 開く時点で明示的にフォーカスを外す
    Keyboard.dismiss();
    // measureInWindowは非同期（ネイティブブリッジ経由）のため、先に暫定位置でメニューを開いてから
    // 実際の位置に更新する。ネイティブ環境ではほぼ同一フレーム内に解決され体感できるズレは生じない
    setMenuHeight(null);
    setAnchor({ x: 0, y: 0, width: 0, height: 0 });
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

  const handleClose = () => {
    setAnchor(null);
    setMenuHeight(null);
  };

  const handleMenuLayout = (e: LayoutChangeEvent) => {
    // 初回レイアウト時の高さだけを採用する（項目の展開等でこのメニュー自体の高さが
    // 動的に変わる想定は無いため、以降のonLayoutは無視して不要な位置再計算を避ける）
    if (menuHeight == null) setMenuHeight(e.nativeEvent.layout.height);
  };

  // トリガーの下に開いた場合に画面下端からはみ出すか。まだ高さが分からない場合ははみ出さない
  // 前提（下開き）で暫定描画し、実際の高さが分かってからのみ上開きへ切り替える
  const menuPositionStyle = anchor ? computeMenuPositionStyle(anchor, menuHeight, minWidth) : null;

  return (
    <>
      {/* collapsable={false}: Androidがスタイルなしのラッパーを最適化で消してしまい、
          measureInWindowが効かなくなるのを防ぐ */}
      <View ref={triggerRef} collapsable={false}>
        {renderTrigger({ open, onPress: handleOpen })}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable testID={backdropTestID} style={styles.backdrop} onPress={handleClose} />
        {anchor && (
          <View
            onLayout={handleMenuLayout}
            style={[styles.menu, menuPositionStyle, menuHeight == null && styles.menuMeasuring]}
            // 高さ確定前(opacity:0)は暫定位置に描画されているため、見えない状態でのタップを防ぐ
            pointerEvents={menuHeight == null ? 'none' : 'auto'}
          >
            {groups.map((group, index) => (
              <View key={group.map((item) => item.key).join('-')}>
                {index > 0 && <View style={styles.divider} />}
                {group.map((item) => (
                  <DropdownMenuRow key={item.key} item={item} onSelect={handleClose} />
                ))}
              </View>
            ))}
          </View>
        )}
      </Modal>
    </>
  );
}

// ヘッダー右上に置く「⋮」トリガー。種目詳細・ワークアウト画面で共通のサイズ・タップ領域を使う
export function DropdownMenuHeaderTrigger({
  open,
  onPress,
  accessibilityLabel = 'メニューを開く',
}: {
  open: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.headerTrigger}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
    >
      <IconSymbol name="ellipsis" size={20} color={open ? Colors.accent : Colors.textPlaceholder} />
    </TouchableOpacity>
  );
}

// headerRightにそのまま渡せる「⋮」メニュー。DropdownMenu+DropdownMenuHeaderTriggerの配線を
// まとめ、画面側での重複（旧: workout/[id].tsx・exercise/[id].tsxがそれぞれ同じ6行を書いていた）を無くす
export function HeaderMenu({
  groups,
  minWidth = 140,
  accessibilityLabel,
}: {
  groups: DropdownMenuItem[][];
  minWidth?: number;
  accessibilityLabel?: string;
}) {
  return (
    <DropdownMenu
      groups={groups}
      minWidth={minWidth}
      renderTrigger={({ open, onPress }) => (
        <DropdownMenuHeaderTrigger open={open} onPress={onPress} accessibilityLabel={accessibilityLabel} />
      )}
    />
  );
}

function DropdownMenuRow({ item, onSelect }: { item: DropdownMenuItem; onSelect: () => void }) {
  const { label, onPress, disabled, hint } = item;
  const isRadio = 'selected' in item;
  const danger = !isRadio && item.danger;

  const handlePress = () => {
    // TouchableOpacityのdisabledは実タップは防げるが、呼び出し側のonPressは
    // disabled理由（hasHistory等）を知らないことがあるため、ここでも防御する
    if (disabled) return;
    onSelect();
    onPress();
  };

  return (
    <TouchableOpacity
      style={[styles.menuItem, isRadio && item.selected && styles.menuItemSelected]}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole={isRadio ? 'radio' : 'button'}
      accessibilityLabel={label}
      accessibilityState={isRadio ? { checked: item.selected } : { disabled: !!disabled }}
      accessibilityHint={hint}
    >
      {isRadio ? (
        <View style={styles.checkSlot}>
          {item.selected && <DesignIcon name="check" size={16} color={Colors.accent} />}
        </View>
      ) : (
        <DesignIcon
          name={item.icon}
          size={18}
          color={disabled ? Colors.textPlaceholder : danger ? Colors.danger : Colors.textMuted}
        />
      )}
      <Text
        style={[
          styles.menuItemText,
          disabled && styles.menuItemDisabled,
          danger && styles.menuItemDanger,
          isRadio && item.selected && styles.menuItemTextSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerTrigger: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  // 高さ測定前(menuHeight未確定)は上開き/下開きの最終位置がまだ決まっていないため、
  // 暫定位置での一瞬の表示("下開き"前提の位置に一瞬見えてから上に飛ぶ)を隠す
  menuMeasuring: { opacity: 0 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: 4 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
    paddingHorizontal: 11,
    minHeight: 44,
  },
  menuItemSelected: { backgroundColor: Colors.accentSurface },
  checkSlot: { width: 16, alignItems: 'center' },
  menuItemText: { ...Typography.body, fontWeight: '500', color: Colors.textPrimary },
  menuItemTextSelected: { color: Colors.accent, fontWeight: '600' },
  menuItemDisabled: { color: Colors.textPlaceholder },
  menuItemDanger: { color: Colors.danger },
});
