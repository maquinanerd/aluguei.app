import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, View, StyleSheet } from 'react-native';

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
}

/** Error boundary do app: erros não recuperáveis não derrubam a UI inteira. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Path de erro explícito: logar (sem PII) — sem crash silencioso.
    console.error('AppErrorBoundary', error.message, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.container} accessibilityRole="alert">
          <Text style={styles.title}>Algo deu errado</Text>
          <Text style={styles.message}>
            Não foi possível carregar esta tela. Verifique sua conexão e tente novamente.
          </Text>
          <Text style={styles.hint} onPress={() => this.setState({ error: null })}>
            Toque para tentar novamente
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  message: { fontSize: 14, color: '#444', textAlign: 'center', marginBottom: 16 },
  hint: { fontSize: 14, color: '#1a73e8' },
});
