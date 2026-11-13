import { useEffect, useState } from 'react'

export function Login({ error, loading, onSubmit }) {
  const [token, setToken] = useState('')
  const [localError, setLocalError] = useState('')
  const [unlockField, setUnlockField] = useState(false)

  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  function handleSubmit(event) {
    event.preventDefault()
    const next = token.trim()
    if (!next) {
      setLocalError('Cole o token de acesso.')
      return
    }
    setLocalError('')
    onSubmit(next)
  }

  const message = localError || error

  return (
    <div className="login-page">
      <a className="skip-link" href="#entrar">
        Ir para o acesso
      </a>
      <header className="login-top">
        <p className="wordmark">Sicoob</p>
        <p>Ciro · cobrança</p>
      </header>
      <section className="login-stage">
        <div className="login-copy">
          <h1>
            <span>Fale com o Ciro no site ou receba uma ligação.</span>
          </h1>
          <p>O mesmo token da bancada Viveo abre esta demonstração. Depois você escolhe a conversa ou o telefone.</p>
        </div>
        <div className="login-shell">
          <form id="entrar" className="login-panel" autoComplete="off" onSubmit={handleSubmit}>
            <div className="login-autofill-trap" aria-hidden="true">
              <input type="text" tabIndex={-1} autoComplete="username" />
            </div>
            <label className="field">
              <span>Token de acesso</span>
              <input
                type="password"
                name="ex_access"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Cole o token recebido"
                value={token}
                readOnly={!unlockField}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                onFocus={() => setUnlockField(true)}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <button type="submit" className="cta" disabled={loading}>
              <span>{loading ? 'Verificando...' : 'Entrar'}</span>
            </button>
            {message ? (
              <p className="form-error" role="alert">
                {message}
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  )
}
