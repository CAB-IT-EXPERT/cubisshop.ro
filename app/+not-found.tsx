import { Link, Stack, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Pagina nu există' }} />
      <View style={styles.container}>
        <Text style={styles.text}>Această pagină nu există.</Text>
        <Link href={'/(tabs)' as Href} style={styles.link}>
          <Text>Înapoi la Cubis Shop</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  text: {
    fontSize: 20,
    fontWeight: 600,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
