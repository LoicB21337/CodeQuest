import { getAppMessage } from './app-message';

export function App() {
  return (
    <main>
      <h1>{getAppMessage()}</h1>
    </main>
  );
}
