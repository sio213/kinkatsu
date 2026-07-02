import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

export function useKeyboardInset() {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardInset(e.endCoordinates.height + 32);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return keyboardInset;
}
