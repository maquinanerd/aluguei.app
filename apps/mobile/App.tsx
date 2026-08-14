import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { AppErrorBoundary } from './src/error-boundary';
import { useConnectivity } from './src/connectivity';

function Home() {
  const online = useConnectivity();

  return (
    <View style={styles.container}>
      {!online ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Text style={styles.offlineText}>Sem conexão — dados podem estar desatualizados</Text>
        </View>
      ) : null}
      <Text style={styles.title}>Aluguei.app</Text>
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Home />
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  offlineBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fde68a',
    paddingVertical: 6,
    alignItems: 'center',
  },
  offlineText: { fontSize: 12, color: '#92400e' },
});
