import { Conversation } from '@elevenlabs/client'
import { useEffect, useRef, useState } from 'react'
import { conversationByCall, conversationResult, openSession, placeCall } from './api.js'
import {
  FINANCIAL_DEFAULTS,
  cashAmount,
  formatBrl,
  groupVariables,
  installmentAmount,
  parseNumber,
} from './negotiation.js'
import { Orb } from './Orb.jsx'

const RESULT_ATTEMPTS = 30
const RESULT_WAIT_MS = 4000
const CALL_ATTEMPTS = 40
const CALL_WAIT_MS = 5000

const LABELS = {
  nome_cooperado: 'Nome do cooperado',
  celular: 'Celular para contato',
  saldo_divida: 'Saldo da dívida',
  dias_vencidos: 'Quantidade de dias vencidos',
  desconto_a_vista: 'Desconto à vista (%)',
  max_parcelas: 'Parcelas máximas (cartão)',
  juros: 'Juros ao mês (%)',
}

const HINTS = {
  desconto_a_vista: 'De 0 a 100. Zero não libera desconto.',
  max_parcelas: '1 não libera parcelamento.',
  juros: 'Zero é parcelamento sem juros.',
}

const STATUS_LABEL = {
  initiated: 'Iniciada',
  'in-progress': 'Em andamento',
  processing: 'Processando a análise',
  done: 'Concluída',
  completed: 'Concluída',
  failed: 'Falhou',
}

function roleOf(message) {
  return message?.source === 'user' || message?.role === 'user' ? 'user' : 'agent'
}

function readConversationId(conversation) {
  try {
    const id = conversation?.getId?.()
    return typeof id === 'string' ? id.trim() : ''
  } catch {
    return ''
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function formatLabel(key) {
  if (LABELS[key]) return LABELS[key]
  const cleaned = String(key ?? '').replace(/[_-]+/g, ' ').trim()
  if (!cleaned) return String(key ?? '')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function outcomeLabel(value) {
  if (value === 'success' || value === 'successful' || value === true) return { text: 'Sim', tone: 'success' }
  if (value === 'failure' || value === 'failed' || value === false) return { text: 'Não', tone: 'failure' }
  return { text: '—', tone: 'unknown' }
}

function ResultValue({ children, long = false }) {
  return <dd className={`talk-result-value${long ? ' is-long' : ''}`}>{children}</dd>
}

function ConversationResult({ conversationId, result, error, copied, onCopy, pending }) {
  const criteria = result?.criteria ?? []
  const collected = result?.dataCollection ?? []
  const variables = result?.variables ?? []
  const summary = result?.summary ?? ''
  const status = STATUS_LABEL[result?.status] || result?.status || ''
  const call = outcomeLabel(result?.callSuccessful)

  return (
    <section className="talk-result" aria-live="polite">
      <header className="talk-result-pin">
        <p className="talk-result-kicker">Resultado da conversa</p>
        <div className="talk-result-id">
          <span>ID da conversa</span>
          <code title={conversationId}>{conversationId}</code>
          <button type="button" onClick={onCopy}>
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </header>
      <div className="talk-result-scroll">
        <header className="talk-result-head">
          <h2>Dados da chamada</h2>
          {!result?.ready && !error ? <p>{pending}</p> : null}
        </header>
        <dl className="talk-result-list">
          {status ? (
            <div className="talk-result-row">
              <dt>Status</dt>
              <ResultValue>{status}</ResultValue>
            </div>
          ) : null}
          {typeof result?.durationSecs === 'number' ? (
            <div className="talk-result-row">
              <dt>Duração</dt>
              <ResultValue>{formatDuration(result.durationSecs)}</ResultValue>
            </div>
          ) : null}
          {result?.callSuccessful ? (
            <div className="talk-result-row">
              <dt>Chamada bem-sucedida</dt>
              <ResultValue>{call.text}</ResultValue>
            </div>
          ) : null}
          {summary ? (
            <div className="talk-result-row">
              <dt>Resumo</dt>
              <ResultValue long>{summary}</ResultValue>
            </div>
          ) : null}
        </dl>
        {criteria.length ? (
          <section className="talk-result-group">
            <h3>Critérios de sucesso</h3>
            {criteria.map((item) => {
              const outcome = outcomeLabel(item.result)
              const numeric = typeof item.score === 'number' && item.result === 'unknown'
              return (
                <article key={item.id} className="criterion">
                  <div className="criterion-head">
                    <h4>{formatLabel(item.id)}</h4>
                    <span className={`flag ${numeric ? 'unknown' : outcome.tone}`}>
                      {numeric ? item.score : outcome.text}
                    </span>
                  </div>
                  {item.rationale ? <p className="talk-result-value is-long">{item.rationale}</p> : null}
                </article>
              )
            })}
          </section>
        ) : null}
        {collected.length ? (
          <section className="talk-result-group">
            <h3>Dados coletados</h3>
            <dl className="talk-result-list">
              {collected.map((item) => {
                const value = formatValue(item.value)
                return (
                  <div key={item.id} className="talk-result-row">
                    <dt>{formatLabel(item.id)}</dt>
                    <ResultValue long={value.length > 90}>{value}</ResultValue>
                  </div>
                )
              })}
            </dl>
          </section>
        ) : null}
        {variables.length ? (
          <section className="talk-result-group">
            <h3>Variáveis de retorno</h3>
            <dl className="talk-result-list">
              {variables.map((item) => {
                const value = formatValue(item.value)
                return (
                  <div key={item.id} className="talk-result-row">
                    <dt>{formatLabel(item.id)}</dt>
                    <ResultValue long={value.length > 90}>{value}</ResultValue>
                  </div>
                )
              })}
            </dl>
          </section>
        ) : null}
        {error ? <p className="talk-result-note">{error}</p> : null}
      </div>
    </section>
  )
}

function DealPreview({ values }) {
  const saldo = parseNumber(values.saldo_divida)
  const desconto = parseNumber(values.desconto_a_vista)
  const maximo = parseNumber(values.max_parcelas)
  const juros = parseNumber(values.juros)
  const aVista = cashAmount(saldo, desconto)
  const vezes = maximo != null ? Math.trunc(maximo) : null
  const linhas = []
  if (vezes != null && vezes > 1 && saldo != null) {
    const teto = Math.min(vezes, 12)
    for (let n = 2; n <= teto; n += 1) {
      const parcela = installmentAmount(saldo, n, juros ?? 0)
      linhas.push(`${n}x de ${formatBrl(parcela)}`)
    }
    if (vezes > teto) linhas.push(`até ${vezes}x na ligação`)
  }
  return (
    <div className="deal-preview">
      <p>
        {aVista == null
          ? 'À vista: preencha o saldo para ver o total.'
          : desconto
            ? `À vista com desconto: ${formatBrl(aVista)}`
            : `À vista: ${formatBrl(aVista)}, sem desconto.`}
      </p>
      {linhas.length ? <p>{`Parcelas: ${linhas.join(', ')}.`}</p> : <p>Sem parcelamento com o máximo em 1.</p>}
    </div>
  )
}

function VariableForm({ variables, values, onChange, locked, phone }) {
  if (!variables.length) {
    return <p className="sheet-note">Este agente não tem variáveis de entrada.</p>
  }
  const missing = variables.filter((item) => !String(values[item.name] ?? '').trim())
  const groups = groupVariables(variables)
  return (
    <form className="variable-form" onSubmit={(event) => event.preventDefault()}>
      {groups.map((group) => (
        <section className="field-section" key={group.id}>
          <h3>{group.title}</h3>
          {group.fields.map((item) => (
            <label className="field" key={item.name}>
              <span>{formatLabel(item.name)}</span>
              <input
                value={values[item.name] ?? ''}
                disabled={locked}
                inputMode={item.name === 'celular' ? 'tel' : group.id === 'deal' ? 'decimal' : undefined}
                placeholder={item.placeholder || 'Preencha para prosseguir'}
                onChange={(event) => onChange(item.name, event.target.value)}
              />
              {HINTS[item.name] ? <small className="field-hint">{HINTS[item.name]}</small> : null}
              {phone && item.name === 'celular' ? (
                <small className="field-hint">A ligação sai para este celular.</small>
              ) : null}
            </label>
          ))}
          {group.id === 'deal' ? <DealPreview values={values} /> : null}
        </section>
      ))}
      {missing.length ? (
        <p className="sheet-alert" role="alert">
          Preencha os campos para prosseguir.
        </p>
      ) : null}
    </form>
  )
}

export function Talk({ token, channel, agent, variables, onBack, onSignOut }) {
  const phone = channel === 'phone'
  const [status, setStatus] = useState('idle')
  const [agentMode, setAgentMode] = useState('listening')
  const [messages, setMessages] = useState([])
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [callId, setCallId] = useState('')
  const [result, setResult] = useState(null)
  const [resultError, setResultError] = useState('')
  const [copied, setCopied] = useState(false)
  const [values, setValues] = useState(FINANCIAL_DEFAULTS)
  const sessionRef = useRef(null)
  const listRef = useRef(null)
  const missing = variables.filter((item) => !String(values[item.name] ?? '').trim())
  const ready = missing.length === 0

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, status])

  useEffect(() => () => {
    sessionRef.current?.endSession?.().catch(() => {})
    sessionRef.current = null
  }, [])

  useEffect(() => {
    if (phone || status !== 'ended' || !conversationId) return undefined
    let cancelled = false
    async function load() {
      for (let attempt = 0; attempt < RESULT_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await wait(RESULT_WAIT_MS)
        if (cancelled) return
        try {
          const next = await conversationResult(token, conversationId)
          if (cancelled) return
          setResult(next)
          setResultError('')
          if (next.ready) return
        } catch (reason) {
          if (cancelled) return
          setResultError(reason instanceof Error ? reason.message : 'Não foi possível ler o resultado.')
          return
        }
      }
      if (!cancelled) {
        setResultError('A análise ainda não ficou pronta. O ID da conversa já pode ser usado.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [phone, status, conversationId, token])

  useEffect(() => {
    if (!phone || !callId) return undefined
    let cancelled = false
    async function load() {
      for (let attempt = 0; attempt < CALL_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await wait(CALL_WAIT_MS)
        if (cancelled) return
        try {
          const next = await conversationByCall(token, callId)
          if (cancelled) return
          if (!next.found) continue
          setConversationId(next.conversationId || '')
          setResult(next)
          setResultError('')
          if (next.ready) {
            setStatus('ended')
            return
          }
        } catch (reason) {
          if (cancelled) return
          setResultError(reason instanceof Error ? reason.message : 'Não foi possível ler o resultado.')
          return
        }
      }
      if (!cancelled) {
        setResultError('A ligação foi para a fila. A análise aparece aqui quando a chamada terminar.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [phone, callId, token])

  function rememberConversation(conversation) {
    const id = readConversationId(conversation)
    if (id) setConversationId(id)
    return id
  }

  function pushMessage(role, text) {
    const next = text?.trim()
    if (!next) return
    setMessages((current) => {
      const last = current[current.length - 1]
      if (last && last.role === role && last.text === next) return current
      return [...current, { id: crypto.randomUUID(), role, text: next }]
    })
  }

  async function stop() {
    const current = sessionRef.current
    rememberConversation(current)
    sessionRef.current = null
    setStatus('ended')
    setAgentMode('listening')
    try {
      await current?.endSession?.()
    } catch {
      // A sessão já pode ter caído.
    }
  }

  function openMic(conversation) {
    try {
      conversation.setMicMuted(false)
    } catch {
      // Sem microfone nesta sessão.
    }
  }

  async function startVoice() {
    if (!ready || phone) return
    setError('')
    setResult(null)
    setResultError('')
    setConversationId('')
    setCopied(false)
    setStatus('connecting')
    setMessages([])
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      const session = await openSession(token, values)
      const conversation = await Conversation.startSession({
        signedUrl: session.signedUrl,
        dynamicVariables: session.dynamicVariables,
        connectionType: 'websocket',
        onConnect: () => setStatus('connected'),
        onDisconnect: () => {
          rememberConversation(sessionRef.current)
          sessionRef.current = null
          setAgentMode('listening')
          setStatus((current) => (current === 'connected' || current === 'connecting' ? 'ended' : current))
        },
        onModeChange: ({ mode: next }) => setAgentMode(next === 'speaking' ? 'speaking' : 'listening'),
        onMessage: (message) => pushMessage(roleOf(message), message?.message),
        onError: (message) => {
          setError(typeof message === 'string' ? message : 'Não foi possível manter a conversa.')
        },
      })
      sessionRef.current = conversation
      rememberConversation(conversation)
      setStatus('connected')
      openMic(conversation)
    } catch (reason) {
      setStatus('idle')
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError'
      setError(
        denied
          ? 'Autorize o microfone para iniciar a conversa por voz.'
          : reason instanceof Error
            ? reason.message
            : 'Não foi possível abrir a conversa.',
      )
    }
  }

  async function startCall() {
    if (!ready || !phone) return
    setError('')
    setResult(null)
    setResultError('')
    setConversationId('')
    setCopied(false)
    setCallId('')
    setStatus('connecting')
    try {
      const sent = await placeCall(token, values)
      setCallId(sent.call_id)
      setStatus('queued')
    } catch (reason) {
      setStatus('idle')
      setError(reason instanceof Error ? reason.message : 'Não foi possível pedir a ligação.')
    }
  }

  async function copyId() {
    const value = conversationId || callId
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      return
    } catch {
      // O navegador pode recusar a área de transferência sem foco.
    }
    try {
      const field = document.createElement('textarea')
      field.value = value
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.focus()
      field.select()
      setCopied(document.execCommand('copy'))
      field.remove()
    } catch {
      setCopied(false)
    }
  }

  const live = status === 'connected' || status === 'connecting'
  const queued = status === 'queued'
  const ended = status === 'ended'
  const showVoiceChat = !phone && (live || (ended && messages.length > 0))

  function transcript(empty) {
    if (messages.length === 0) {
      return (
        <li className="empty">
          <p>{empty}</p>
        </li>
      )
    }
    return messages.map((item) => (
      <li key={item.id} className={`bubble ${item.role}`}>
        <span>{item.role === 'user' ? 'Você' : 'Ciro'}</span>
        <p>{item.text}</p>
      </li>
    ))
  }

  function activate() {
    if (phone) startCall()
    else startVoice()
  }

  return (
    <div className={`talk voice ${live || queued ? 'is-live' : ''} ${ended ? 'is-ended' : ''}`}>
      <header className="talk-top">
        <div className="talk-brand">
          <p className="wordmark">Sicoob</p>
          <p className="talk-user">{agent.name}</p>
        </div>
        <div className="talk-actions">
          <button type="button" className="quiet" onClick={onBack}>
            Início
          </button>
          <button type="button" className="quiet" onClick={onSignOut}>
            Sair
          </button>
        </div>
      </header>
      <div className="talk-body">
        <aside className="client-sheet" aria-label="Variáveis de entrada">
          <p className="kicker">{phone ? 'Ligação' : 'Conversa'}</p>
          <h2>{phone ? 'Dados da ligação' : 'Dados do cooperado'}</h2>
          <p className="sheet-note">
            {phone
              ? 'Uma ligação para o celular informado. Os outros campos seguem com o Ciro.'
              : 'Estes campos são as variáveis dinâmicas de entrada do agente.'}
          </p>
          <VariableForm
            variables={variables}
            values={values}
            locked={live || queued}
            phone={phone}
            onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
          />
        </aside>
        <div className="talk-main">
          <main className="talk-stage">
            <div className={`orb-slot ${agentMode}`}>
              {ended ? (
                <>
                  <Orb speaking={false} listening={false} />
                  <button type="button" className="orb-restart" disabled={!ready} onClick={activate}>
                    {phone ? 'Nova ligação' : 'Nova conversa'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="orb-hit"
                  disabled={!ready || live || queued}
                  onClick={activate}
                >
                  <Orb speaking={agentMode === 'speaking'} listening={live || queued} />
                  {!live && !queued ? (
                    <span className="orb-label">{phone ? 'Ligar' : 'Conversar'}</span>
                  ) : null}
                </button>
              )}
            </div>
            {live || queued || ended ? (
              <p className="talk-status">
                {queued
                  ? 'Ligação na fila'
                  : live
                    ? status === 'connecting'
                      ? 'Conectando'
                      : agentMode === 'speaking'
                        ? 'Falando'
                        : 'Ouvindo'
                    : 'Encerrada'}
              </p>
            ) : null}
            {phone && queued && !conversationId ? (
              <p className="call-wait">
                O Ciro vai ligar para o celular informado.
                {callId ? <code>{callId}</code> : null}
              </p>
            ) : null}
            {!phone && ended && conversationId ? (
              <div className="talk-split">
                <ConversationResult
                  conversationId={conversationId}
                  result={result}
                  error={resultError}
                  copied={copied}
                  onCopy={copyId}
                  pending="A chamada terminou. Estou buscando a análise."
                />
                <section className="chat" aria-live="polite">
                  <ol className="messages" ref={listRef}>
                    {transcript('Pode falar. O microfone está ligado.')}
                  </ol>
                </section>
              </div>
            ) : null}
            {phone && conversationId ? (
              <div className="talk-split">
                <ConversationResult
                  conversationId={conversationId}
                  result={result}
                  error={resultError}
                  copied={copied}
                  onCopy={copyId}
                  pending="A ligação está em andamento. A análise entra quando ela terminar."
                />
                <section className="chat" aria-live="polite">
                  <ol className="messages">
                    <li className="empty">
                      <p>A conversa desta ligação aparece na análise ao lado.</p>
                    </li>
                  </ol>
                </section>
              </div>
            ) : null}
            {showVoiceChat && !(ended && conversationId) ? (
              <section className={`chat${live ? ' has-end' : ''}`} aria-live="polite">
                {live && status === 'connected' ? (
                  <button type="button" className="end-call" aria-label="Encerrar" onClick={stop}>
                    Encerrar
                  </button>
                ) : null}
                <ol className="messages" ref={listRef}>
                  {transcript(status === 'connecting' ? 'Conectando...' : 'Pode falar. O microfone está ligado.')}
                </ol>
              </section>
            ) : null}
            {error ? (
              <p className="talk-error" role="alert">
                {error}
              </p>
            ) : null}
            {phone && resultError && !conversationId ? (
              <p className="talk-error" role="status">
                {resultError}
              </p>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  )
}
