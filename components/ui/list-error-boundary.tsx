import { Colors, Typography } from '@/constants/theme';
import { Component } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export class ListErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: Colors.danger, ...Typography.footnote }}>
            表示エラーが発生しました。アプリを再起動してください。
          </Text>
          <TouchableOpacity onPress={() => this.setState({ error: null })}>
            <Text style={{ color: Colors.accent, ...Typography.footnote }}>再試行</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
