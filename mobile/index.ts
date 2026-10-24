// Must be first: the DNotifier SDK needs crypto.getRandomValues, which React Native lacks.
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
