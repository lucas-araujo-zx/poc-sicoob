import { useEffect, useState } from 'react'
import { catalog, clearToken, login, readToken, writeToken } from './api.js'
import { Home } from './Home.jsx'
import { Login } from './Login.jsx'
import { Talk } from './Talk.jsx'

export function App() {
  const [token, setToken] = useState(readToken)
  const [catalogData, setCatalogData] = useState(null)
  const [screen, setScreen] = useState('home')
  const [booting, setBooting] = useState(Boolean(readToken()))
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setCatalogData(null)
      setScreen('home')
      setBooting(false)
      return undefined
    }
    let cancelled = false
    setBooting(true)
    catalog(token)
      .then((data) => {
        if (!cancelled) setCatalogData(data)
      })
      .catch((error) => {
        if (!cancelled) {
          clearToken()
          setToken('')
          setCatalogData(null)
          setLoginError(error.message)
        }
      })
      .finally(() => {
        if (!cancelled) setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleLogin(next) {
    setLoginLoading(true)
    setLoginError('')
    try {
      await login(next)
      writeToken(next)
      setToken(next)
    } catch (error) {
      setLoginError(error.message)
    } finally {
      setLoginLoading(false)
    }
  }

  function signOut() {
    clearToken()
    setToken('')
    setCatalogData(null)
    setScreen('home')
  }

  if (!token || !catalogData) {
    return <Login error={loginError} loading={loginLoading || booting} onSubmit={handleLogin} />
  }

  if (screen === 'talk' || screen === 'call') {
    return (
      <Talk
        token={token}
        channel={screen === 'call' ? 'phone' : 'web'}
        agent={catalogData.agent}
        variables={catalogData.variables || []}
        onBack={() => setScreen('home')}
        onSignOut={signOut}
      />
    )
  }

  return (
    <Home
      agentName={catalogData.agent?.name || 'Ciro'}
      onTalk={() => setScreen('talk')}
      onCall={() => setScreen('call')}
      onSignOut={signOut}
    />
  )
}
