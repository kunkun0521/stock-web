import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { CurrentStockProvider } from './context/CurrentStockContext.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <CurrentStockProvider>
                <App/>
            </CurrentStockProvider>
        </BrowserRouter>
    </React.StrictMode>
);
