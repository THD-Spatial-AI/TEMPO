import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled (not Google Fonts) so the Electron app renders offline.
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import 'material-symbols/outlined.css'
import './index.css'
import App from './App.jsx'
import { ConfirmHost } from './components/ui/ConfirmDialog'
import TitleBar from './components/TitleBar'

// Suppress WebGL context initialization errors
const originalError = console.error;
console.error = (...args) => {
  const errorMessage = args[0]?.toString() || '';
  // Suppress specific WebGL errors that don't affect functionality
  if (errorMessage.includes('maxTextureDimension2D') || 
      errorMessage.includes('Cannot read properties of undefined (reading \'maxTextureDimension2D\')')) {
    return;
  }
  originalError.apply(console, args);
};

// Suppress uncaught errors for WebGL context
window.addEventListener('error', (event) => {
  if (event.message?.includes('maxTextureDimension2D') ||
      event.error?.message?.includes('maxTextureDimension2D')) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TitleBar />
    <App />
    <ConfirmHost />
  </StrictMode>,
)
