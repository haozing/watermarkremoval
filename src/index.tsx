import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { loadingOnnxruntime } from './adapters/util'

loadingOnnxruntime()

const container = document.getElementById('root')!
const root = createRoot(container)
root.render(<App />)
