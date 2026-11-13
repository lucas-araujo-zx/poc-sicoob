export function Home({ agentName, onTalk, onCall, onSignOut }) {
  return (
    <div className="login-page home-page">
      <header className="login-top">
        <p className="wordmark">Sicoob</p>
        <button type="button" className="quiet" onClick={onSignOut}>
          Sair
        </button>
      </header>
      <main className="home-stage">
        <p className="kicker">Ciro</p>
        <h1>Como você quer falar com o cooperado?</h1>
        <p className="home-lead">{agentName}</p>
        <div className="choice-grid">
          <article className="choice-card">
            <p className="kicker">No site</p>
            <h2>Conversa por voz</h2>
            <p>Preencha as variáveis na barra ao lado e clique na esfera. No fim, a análise da conversa aparece na tela.</p>
            <button type="button" className="cta" onClick={onTalk}>
              Abrir conversa
            </button>
          </article>
          <article className="choice-card">
            <p className="kicker">Telefone</p>
            <h2>Uma ligação</h2>
            <p>Cadastre um celular e os mesmos dados da conversa. O Ciro liga uma vez, pelo discador.</p>
            <button type="button" className="cta" onClick={onCall}>
              Abrir ligação
            </button>
          </article>
        </div>
      </main>
    </div>
  )
}
