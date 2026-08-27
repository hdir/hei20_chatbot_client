import HeiChatClientV3 from "./HeiChatClientV3";
import { ThemeProvider } from "./theme/ThemeContext";
import "./App.css";

export default function App() {
  return (
    <ThemeProvider>
      <HeiChatClientV3 />
    </ThemeProvider>
  );
}
