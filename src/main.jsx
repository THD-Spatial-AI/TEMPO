import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
    <App />
  </StrictMode>,
)
