// src/api/apiClient.ts
import axios from 'axios';

// Creamos una instancia de axios con la configuración base de nuestra API
const apiClient = axios.create({
  // Esta es la URL donde está corriendo nuestro backend de Python
  baseURL: 'http://127.0.0.1:8001/api/v1', 
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;