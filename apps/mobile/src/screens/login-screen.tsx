import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage, login } from '../api';
import type { Navigation } from '../navigation';
import { colors, spacing, typography } from '../tokens';
import { Button, Field, InlineError, Screen, TextField } from '../ui';

interface Props {
  nav: Navigation;
}

export function LoginScreen({ nav }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    const trimmedEmail = email.trim();
    if (trimmedEmail === '' || password === '') {
      setError('Informe e-mail e senha para entrar.');
      return;
    }
    setSubmitting(true);
    try {
      await login(trimmedEmail, password);
      // Substitui o stack: "voltar" não deve retornar ao login.
      nav.reset({ name: 'agenda' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Aluguei.app</Text>
        <Text style={styles.subtitle}>Operação de campo</Text>

        <View style={styles.form}>
          <Field label="E-mail">
            <TextField
              value={email}
              onChangeText={setEmail}
              accessibilityLabel="E-mail"
              placeholder="voce@imobiliaria.com.br"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </Field>
          <Field label="Senha">
            <TextField
              value={password}
              onChangeText={setPassword}
              accessibilityLabel="Senha"
              placeholder="••••••••"
              secureTextEntry
            />
          </Field>

          {error !== null ? <InlineError message={error} /> : null}

          <Button
            label="Entrar"
            onPress={() => {
              void submit();
            }}
            loading={submitting}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: spacing.xxl },
  title: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  subtitle: {
    ...typography.bodyLg,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  form: { gap: spacing.xs },
});
