import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {db,result} from './client';
import {Dashboard} from './workspace';
import './style.css';

const oauthId = new URLSearchParams(location.search).get('authorization_id');
const rootUrl = location.origin + '/';
function Auth({recovery,finish}) {
  const [mode,setMode] = useState('login');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const {email,password} = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setMessage('');
    try {
      if (recovery) { await result(db.auth.updateUser({password})); finish(); return; }
      if (mode === 'register') {
        const data = await result(db.auth.signUp({email,password,options:{emailRedirectTo:rootUrl}}));
        if (!data.session) setMessage('Controlla la posta e conferma il tuo indirizzo per accedere.');
      } else if (mode === 'reset') {
        await result(db.auth.resetPasswordForEmail(email,{redirectTo:rootUrl}));
        setMessage('Se l’indirizzo è registrato, riceverai un link per reimpostare la password.');
      } else await result(db.auth.signInWithPassword({email,password}));
    } catch (error) {setMessage(error.message);}
    finally {setBusy(false);}
  }
  return <main className="auth-layout"><section className="intro"><span className="eyebrow">RIVISTA NAZIONALE LION</span><h1>La tua storia,<br/>in redazione.</h1><p>Invia un articolo o racconta un service del tuo club. Segui la revisione e dialoga con la redazione nello stesso spazio.</p><div className="intro-rule"/></section><section className="auth-card panel">
    <h2>{recovery ? 'Nuova password' : {login:'Accedi',register:'Crea un account',reset:'Recupera la password'}[mode]}</h2>
    <form onSubmit={submit}>
      {!recovery && <label>Email<input name="email" type="email" autoComplete="email" required/></label>}
      {(recovery || mode !== 'reset') && <label>Password<input name="password" type="password" minLength={recovery || mode === 'register' ? 8 : undefined} autoComplete={mode === 'login' && !recovery ? 'current-password' : 'new-password'} required/></label>}
      <button className="primary" disabled={busy}>{busy ? 'Attendi…' : recovery ? 'Salva password' : {login:'Accedi',register:'Registrati',reset:'Invia il link'}[mode]}</button>
    </form>
    {message && <p className="feedback" role="status">{message}</p>}
    {!recovery && <div className="auth-links"><button className="text-button" onClick={() => {setMode(mode === 'login' ? 'register' : 'login'); setMessage('');}}>{mode === 'login' ? 'Crea un account' : 'Torna all’accesso'}</button>{mode === 'login' && <button className="text-button" onClick={() => {setMode('reset');setMessage('');}}>Password dimenticata?</button>}</div>}
  </section></main>;
}

function Consent({role}) {
  const [details,setDetails] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    if (role) result(db.auth.oauth.getAuthorizationDetails(oauthId)).then(data => {
      if (data.redirect_url) location.assign(data.redirect_url);
      else setDetails(data);
    }).catch(err => setError(err.message));
  },[role]);
  async function decide(approve) {
    setBusy(true);
    try {
      const action = approve ? db.auth.oauth.approveAuthorization(oauthId,{skipBrowserRedirect:true}) : db.auth.oauth.denyAuthorization(oauthId,{skipBrowserRedirect:true});
      location.assign((await result(action)).redirect_url);
    } catch(err) {setError(err.message);setBusy(false);}
  }
  return <main className="container"><section className="panel"><h1>Collega un’app alla redazione</h1>
    {role === null ? <p>Verifica del ruolo…</p> : !role ? <p>Il collegamento è riservato alla redazione.</p> : details ? <>
      <p>{details.client?.name || 'L’app richiedente'} chiede di leggere gli invii e salvare bozze e note interne.</p>
      <p className="muted">Indirizzo di ritorno: {details.redirect_uri}</p>
      <div className="actions"><button className="primary" disabled={busy} onClick={() => decide(true)}>Autorizza</button><button disabled={busy} onClick={() => decide(false)}>Rifiuta</button></div>
    </> : !error && <p>Caricamento della richiesta…</p>}
    {error && <p role="alert" className="feedback">{error}</p>}
  </section></main>;
}

function App() {
  const [session,setSession] = useState(undefined);
  const [role,setRole] = useState(null);
  const [recovery,setRecovery] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {
    if (!db) return;
    const {data:{subscription}} = db.auth.onAuthStateChange((event,value) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(value);
    });
    return () => subscription.unsubscribe();
  },[]);
  const userId = session?.user.id;
  useEffect(() => {
    setRole(null);
    setError('');
    if (!userId) return;
    let active = true;
    (async () => {
      const member = await result(db.from('redazione_members').select('role').eq('user_id',userId).maybeSingle());
      if (active) setRole(member?.role || '');
    })().catch(err => {if (active) setError(err.message);});
    return () => {active = false;};
  },[userId]);
  return <><header className="masthead"><div className="topbar"><a className="brand" href="/"><strong>LION</strong><span>Redazione</span></a>{session && <div className="account"><span>{role === 'admin' ? 'Direzione' : role === 'editor' ? 'Redazione' : session.user.email}</span><button onClick={() => db.auth.signOut()}>Esci</button></div>}</div></header>
    {!db ? <main className="container"><p role="alert">Configurazione di Supabase mancante.</p></main>
      : session === undefined ? <main className="container"><p>Caricamento…</p></main>
      : recovery || !session ? <Auth recovery={recovery} finish={() => setRecovery(false)}/>
      : error ? <main className="container"><p role="alert">{error}</p></main>
      : oauthId ? <Consent role={role}/>
      : role === null ? <main className="container"><p>Caricamento…</p></main>
      : <Dashboard key={userId} user={session.user} role={role}/>}
    <footer>Rivista nazionale LION <span>Portale di redazione</span></footer>
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
