'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

const apiBase =
  typeof process.env.NEXT_PUBLIC_API_URL === 'string' && process.env.NEXT_PUBLIC_API_URL.length > 0
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
    : 'http://localhost:4000';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setIsLoading(true);

    try {
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      let data: { token?: string; user?: unknown; message?: string } = {};
      try {
        data = await response.json();
      } catch {
        /* ignore */
      }

      if (response.ok && data.token && data.user) {
        localStorage.setItem('copa_token', data.token);
        localStorage.setItem('copa_user', JSON.stringify(data.user));
        router.push('/');
      } else {
        setError(true);
        setPassword('');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(true);
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="particle particle-1"></div>
      <div className="particle particle-2"></div>
      <div className="particle particle-3"></div>

      <div className="login-card-wrapper">
        <div className="login-card">
          <div className="logo-container">
            <div className="logo">R</div>
            <h1>Bienvenido</h1>
            <p className="subtitle">Sistema de Análisis de RON</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">Usuario</label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input
                  type="text"
                  id="username"
                  placeholder="Ingrese su usuario"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <div className="input-wrapper">
                <span className="input-icon">🔒</span>
                <input
                  type="password"
                  id="password"
                  placeholder="Ingrese su contraseña"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="error-message show">
                Usuario o contraseña incorrectos. Por favor, intente nuevamente.
              </div>
            )}

            <button type="submit" className={`btn-login ${isLoading ? 'loading' : ''}`} disabled={isLoading}>
              <span className="btn-text">Iniciar Sesión</span>
              <div className="loading-spinner"></div>
            </button>
          </form>

          <p className="footer-text">© 2026 Sistema de Recursos de Origen Nacional (RON)</p>
        </div>
      </div>

      <style jsx>{`
        .login-page-container {
          min-height: 100vh;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          background: linear-gradient(135deg, #0f1419 0%, #1b2839 50%, #243447 100%);
          position: relative;
          overflow: hidden;
          font-family: 'Inter', sans-serif;
          color: white;
        }

        .particle {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(52, 211, 153, 0.3), transparent);
          animation: float 20s infinite ease-in-out;
          pointer-events: none;
        }

        .particle-1 {
          width: 300px;
          height: 300px;
          top: -150px;
          left: -150px;
        }
        .particle-2 {
          width: 200px;
          height: 200px;
          bottom: -100px;
          right: -100px;
          animation-delay: 5s;
        }
        .particle-3 {
          width: 250px;
          height: 250px;
          top: 50%;
          right: -125px;
          animation-delay: 10s;
        }

        @keyframes float {
          0%,
          100% {
            transform: translate(0, 0);
          }
          25% {
            transform: translate(50px, 50px);
          }
          50% {
            transform: translate(-30px, 80px);
          }
          75% {
            transform: translate(30px, -50px);
          }
        }

        .login-card-wrapper {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 450px;
          padding: 20px;
        }

        .login-card {
          background: rgba(27, 40, 57, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(52, 211, 153, 0.2);
          border-radius: 24px;
          padding: 48px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }

        .logo-container {
          text-align: center;
          margin-bottom: 32px;
        }
        .logo {
          width: 80px;
          height: 80px;
          margin: 0 auto 16px;
          background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          font-weight: 700;
          color: #0f1419;
          box-shadow: 0 10px 30px rgba(52, 211, 153, 0.3);
        }

        h1 {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .subtitle {
          color: #94a3b8;
          font-size: 14px;
          margin-bottom: 32px;
        }

        .form-group {
          margin-bottom: 24px;
          text-align: left;
        }
        label {
          display: block;
          color: #e2e8f0;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .input-wrapper {
          position: relative;
        }
        .input-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
          font-size: 18px;
        }

        input {
          width: 100%;
          padding: 14px 16px 14px 48px;
          background: rgba(15, 20, 25, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          color: white;
          font-size: 15px;
          transition: all 0.3s ease;
        }

        input:focus {
          outline: none;
          border-color: #34d399;
          box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.1);
          background: rgba(15, 20, 25, 0.8);
        }

        .error-message {
          color: #f87171;
          font-size: 13px;
          margin-bottom: 16px;
          padding: 12px;
          background: rgba(248, 113, 113, 0.1);
          border-left: 3px solid #f87171;
          border-radius: 6px;
        }

        .btn-login {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
          border: none;
          border-radius: 12px;
          color: #0f1419;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-login:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(52, 211, 153, 0.4);
        }

        .btn-login.loading .btn-text {
          display: none;
        }
        .loading-spinner {
          display: none;
          width: 20px;
          height: 20px;
          border: 2px solid #0f1419;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }
        .btn-login.loading .loading-spinner {
          display: block;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .footer-text {
          margin-top: 24px;
          color: #64748b;
          font-size: 13px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
