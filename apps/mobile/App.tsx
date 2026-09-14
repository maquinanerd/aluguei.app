import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppErrorBoundary } from './src/error-boundary';
import { useConnectivity } from './src/connectivity';
import type { Navigation, Route } from './src/navigation';
import { AgendaScreen } from './src/screens/agenda-screen';
import { InspectionReviewScreen } from './src/screens/inspection-review-screen';
import { InspectionScreen } from './src/screens/inspection-screen';
import { LoginScreen } from './src/screens/login-screen';
import { VisitDetailScreen } from './src/screens/visit-detail-screen';
import { colors, spacing, typography } from './src/tokens';

const LOGIN_ROUTE: Route = { name: 'login' };

function titleFor(route: Route): string {
  switch (route.name) {
    case 'login':
      return 'Entrar';
    case 'agenda':
      return 'Agenda';
    case 'visit-detail':
      return 'Visita';
    case 'inspection':
      return 'Vistoria';
    case 'inspection-review':
      return 'Revisão';
  }
}

function renderRoute(route: Route, nav: Navigation) {
  switch (route.name) {
    case 'login':
      return <LoginScreen nav={nav} />;
    case 'agenda':
      return <AgendaScreen nav={nav} />;
    case 'visit-detail':
      return <VisitDetailScreen key={route.visit.id} visit={route.visit} nav={nav} />;
    case 'inspection':
      return (
        <InspectionScreen key={route.inspectionId} inspectionId={route.inspectionId} nav={nav} />
      );
    case 'inspection-review':
      return <InspectionReviewScreen key={route.inspectionId} inspectionId={route.inspectionId} />;
  }
}

function Root() {
  const online = useConnectivity();
  const [stack, setStack] = useState<Route[]>(() => [LOGIN_ROUTE]);
  const route = stack[stack.length - 1] ?? LOGIN_ROUTE;
  const canGoBack = stack.length > 1;

  const navigate = useCallback((next: Route) => {
    setStack((prev) => [...prev, next]);
  }, []);

  const reset = useCallback((next: Route) => {
    setStack([next]);
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const nav: Navigation = { navigate, reset, back, canGoBack };

  return (
    <View style={styles.root}>
      {!online ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Text style={styles.offlineText}>Sem conexão — dados podem estar desatualizados</Text>
        </View>
      ) : null}
      {canGoBack ? (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={back}
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
          >
            <Text style={styles.backButtonText}>‹ Voltar</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{titleFor(route)}</Text>
          <View style={styles.headerSpacer} />
        </View>
      ) : null}
      <View style={styles.content}>{renderRoute(route, nav)}</View>
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  offlineBanner: {
    backgroundColor: '#FDF3E7',
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
  },
  offlineText: { fontSize: 12, color: colors.warning, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  backButton: { paddingVertical: spacing.xs, paddingRight: spacing.md },
  backButtonPressed: { opacity: 0.6 },
  backButtonText: { ...typography.bodyLg, color: colors.brandStrong, fontWeight: '600' },
  headerTitle: { ...typography.bodyLg, color: colors.textPrimary, fontWeight: '600', flex: 1 },
  headerSpacer: { width: 48 },
  content: { flex: 1 },
});
