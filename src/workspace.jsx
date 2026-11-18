import React,{useEffect,useRef,useState} from 'react';
import {diffWordsWithSpace} from 'diff';
import {db,extractText,files,result} from './client';
import {areas,districts,headline,kinds,markedParts,serviceGroups,statuses} from './editorial';

const fmt = new Intl.DateTimeFormat('it-IT',{dateStyle:'medium',timeStyle:'short'});
const attachmentLimit = 10 * 1024 * 1024;
const bucketPath = item => item.author_id + '/' + item.id;
const fileLabel = name => name.slice(name.indexOf('_') + 1);

function useAction() {
  const [working,setWorking] = useState(false);
  const [error,setError] = useState('');
  async function run(action) {
    setWorking(true);
    setError('');
    try {await action();}
    catch(err) {setError(err.message);}
    finally {setWorking(false);}
  }
  return {working,error,run};
}

function ErrorLine({text}) {
  return text && <p role="alert" className="feedback">{text}</p>;
}

function Field({id,label,type='text',required}) {
  return <label>{label}{required && <span className="required"> *</span>}
    {type === 'textarea' ? <textarea name={id} maxLength={5000} required={required}/>
      : type === 'select' ? <select name={id}><option value="">Scegli</option>{areas.map(area => <option key={area}>{area}</option>)}</select>
      : <input name={id} maxLength={300} list={id === 'district' ? 'districts' : undefined} required={required}/>}
  </label>;
}

function Submit({kind,user,open,back}) {
  const [article,setArticle] = useState('');
  const [uploads,setUploads] = useState([]);
  const action = useAction();
  const id = useRef(crypto.randomUUID());
  const stored = useRef(new Map());
  async function addFiles(event) {
    const picked = Array.from(event.target.files);
    event.target.value = '';
    await action.run(async () => {
      if (picked.length + uploads.length > 8 || picked.some(file => file.size > attachmentLimit || !file.size)) throw Error('Puoi allegare fino a 8 file, ciascuno di massimo 10 MB.');
      setUploads(current => [...current,...picked]);
      if (kind === 'article' && !article.trim()) {
        const document = picked.find(file => /\.(docx|txt)$/i.test(file.name));
        if (document) setArticle((await extractText(document)).slice(0,100000));
      }
    });
  }
  async function send(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const {club,district,signature,...fields} = data;
    await action.run(async () => {
      if (!club.trim() || (kind === 'article' && (!signature.trim() || !article.trim()))) throw Error('Compila i campi obbligatori.');
      const existing = await result(db.from('submissions').select('id').eq('id',id.current).maybeSingle());
      if (existing) {await open(existing.id); return;}
      for (const file of uploads) {
        if (stored.current.has(file)) continue;
        const suffix = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9. -]/g,'-').slice(-120);
        const path = user.id + '/' + id.current + '/' + crypto.randomUUID() + '_' + suffix;
        await result(files().upload(path,file,{contentType:'application/octet-stream'}));
        stored.current.set(file,path);
      }
      await result(db.from('submissions').insert({id:id.current,kind,club:club.trim(),district:district.trim(),signature:signature.trim(),fields,original:article.trim()}));
      await open(id.current);
    });
  }
  function cancel() {
    action.run(async () => {
      if (stored.current.size) await result(files().remove([...stored.current.values()]));
      back();
    });
  }
  return <section className="panel form-panel">
    <button className="text-button" disabled={action.working} onClick={cancel}>← Torna agli invii</button>
    <h1>{kinds[kind]}</h1>
    <form onSubmit={send}>
      <fieldset disabled={action.working}><legend>Chi</legend><div className="grid">
        <Field id="club" label={kind === 'service' ? 'Club o club promotori' : 'Club'} required/>
        <Field id="district" label="Distretto"/>
        <datalist id="districts">{districts.map(value => <option key={value} value={value}/>)}</datalist>
        <Field id="signature" label="Firma (nome e cognome di chi scrive)" required={kind === 'article'}/>
      </div></fieldset>
      {kind === 'service' ? serviceGroups.map(([title,fields]) => <fieldset key={title} disabled={action.working}><legend>{title}</legend>
        {fields[0][0].match(/^v[12]n$/) && <p className="muted">Riporta le parole realmente pronunciate, con nome e ruolo della persona.</p>}
        {fields.map(([id,label,type,required]) => <Field key={id} {...{id,label,type,required}}/>)}</fieldset>) : <fieldset disabled={action.working}><legend>Testo</legend>
        <label>Il tuo articolo <span className="required">*</span><textarea className="article-input" value={article} maxLength={100000} onChange={event => setArticle(event.target.value)} placeholder="Incolla titolo e testo oppure allega un file Word o TXT" required/></label>
        <div className="muted">{article.length.toLocaleString('it-IT')} battute · Lunghezza indicativa per la rivista nazionale: 1.500–1.800 battute spazi inclusi.</div>
      </fieldset>}
      <fieldset disabled={action.working}><legend>Allegati</legend><label>Aggiungi documenti o foto<input type="file" accept=".docx,.doc,.txt,.pdf,.odt,.rtf,.jpg,.jpeg,.png,.webp" multiple onChange={addFiles}/></label>
        {uploads.map((file,index) => <div className="file-row" key={index}><span>{file.name}</span><button type="button" onClick={() => action.run(async () => {
          if (stored.current.has(file)) {
            await result(files().remove([stored.current.get(file)]));
            stored.current.delete(file);
          }
          setUploads(current => current.filter((_,i) => i !== index));
        })}>Rimuovi</button></div>)}
      </fieldset>
      <ErrorLine text={action.error}/>
      <button className="primary" disabled={action.working}>{action.working ? 'Attendi…' : 'Invia alla redazione'}</button>
    </form>
  </section>;
}

function Team({back}) {
  const [team,setTeam] = useState([]);
  const action = useAction();
  async function load() {
    setTeam(await result(db.rpc('editor_list')));
  }
  useEffect(() => {action.run(load);},[]);
  return <section className="panel form-panel"><button className="text-button" onClick={back}>← Torna agli invii</button><h1>Collaboratori</h1>
    <p>Chiedi alla persona che vuoi aggiungere di comunicarti direttamente il codice account che vede nella sua scrivania.</p>
    <form className="inline" onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      const account_id = new FormData(form).get('account_id').trim();
      action.run(async () => {await result(db.rpc('grant_editor',{account_id}));form.reset();await load();});
    }}><label>Codice account del redattore<input name="account_id" minLength={36} maxLength={36} required/></label><button className="primary" disabled={action.working}>Autorizza</button></form>
    <h2>Redazione</h2>{team.map(member => <div key={member.email} className="file-row"><span>{member.email} · {member.role === 'admin' ? 'Direzione' : 'Redattore'}</span>{member.role === 'editor' && <button disabled={action.working} onClick={() => action.run(async () => {
      await result(db.rpc('revoke_editor',{address:member.email}));await load();
    })}>Revoca</button>}</div>)}
    <ErrorLine text={action.error}/>
  </section>;
}

function Detail({id,staff,back}) {
  const [item,setItem] = useState(null);
  const [revisions,setRevisions] = useState([]);
  const [comments,setComments] = useState([]);
  const [attachments,setAttachments] = useState([]);
  const [version,setVersion] = useState('');
  const [mode,setMode] = useState('read');
  const [draft,setDraft] = useState('');
  const [comment,setComment] = useState('');
  const [anchor,setAnchor] = useState(null);
  const [staffNote,setStaffNote] = useState(false);
  const textRef = useRef(null);
  const action = useAction();
  async function refresh() {
    const [submission,versions,messages] = await Promise.all([
      result(db.from('submissions').select('*').eq('id',id).single()),
      result(db.from('revisions').select('*').eq('submission_id',id).order('created_at',{ascending:false})),
      result(db.from('comments').select('*').eq('submission_id',id).order('created_at')),
    ]);
    setItem(submission);setRevisions(versions);setComments(messages);
    setAttachments(await result(files().list(bucketPath(submission),{limit:100})));
  }
  useEffect(() => {action.run(refresh);},[id]);
  if (!item) return <><button onClick={back}>← Torna agli invii</button><ErrorLine text={action.error}/>{action.working && <p>Caricamento…</p>}</>;
  const revision = revisions.find(entry => entry.id === version);
  const currentText = revision?.body || item.original;
  const currentComments = comments.filter(msg => msg.revision_id === (revision?.id || null));
  function selectAnchor() {
    const selection = window.getSelection();
    const node = textRef.current;
    if (!node || !selection || selection.isCollapsed || !node.contains(selection.anchorNode) || !node.contains(selection.focusNode)) return;
    const range = selection.getRangeAt(0);
    const prefix = range.cloneRange();
    prefix.selectNodeContents(node);prefix.setEnd(range.startContainer,range.startOffset);
    const excerpt = range.toString().slice(0,1000);
    if (excerpt.trim()) setAnchor({anchor:excerpt,anchor_start:prefix.toString().length});
  }
  async function download(file) {
    const blob = await result(files().download(bucketPath(item) + '/' + file.name));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');link.href = url;link.download = fileLabel(file.name);link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <>
    <div className="detail-nav"><button className="text-button" onClick={back}>← Torna agli invii</button><button onClick={() => action.run(refresh)} disabled={action.working}>Aggiorna</button></div>
    <div className="detail-heading"><div><p className="eyebrow">{kinds[item.kind]}</p><h1>{headline(item)}</h1><p className="muted">{[item.club,item.district,item.signature,fmt.format(new Date(item.created_at))].filter(Boolean).join(' · ')}</p></div>
      {staff ? <label className="status-control">Stato<select value={item.status} disabled={action.working} onChange={event => {
        const status = event.target.value;
        action.run(async () => {await result(db.from('submissions').update({status}).eq('id',id).select('id').single());await refresh();});
      }}>{Object.entries(statuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label> : <span className={'status '+item.status}>{statuses[item.status]}</span>}
    </div>
    <ErrorLine text={action.error}/>
    <div className="workbench">
      <section className="panel manuscript"><div className="editor-toolbar">
        <label>Versione<select value={version} onChange={event => {setVersion(event.target.value);setAnchor(null);setMode('read');}}>
          <option value="">{item.kind === 'service' ? 'Scheda inviata' : 'Testo originale'}</option>
          {revisions.map((entry,index) => <option key={entry.id} value={entry.id}>Revisione {revisions.length-index} · {entry.source === 'ai' ? 'AI' : 'Redazione'} · {entry.shared ? 'Condivisa' : 'Interna'}</option>)}</select></label>
        {staff && <button disabled={action.working} onClick={() => {setDraft(currentText);setMode('edit');setAnchor(null);}}>Nuova revisione</button>}
        {revision && mode !== 'edit' && <button onClick={() => {setMode(mode === 'diff' ? 'read' : 'diff');setAnchor(null);}}>{mode === 'diff' ? 'Leggi versione' : 'Confronta con l’originale'}</button>}
      </div>
      {mode === 'edit' ? <form onSubmit={event => {
        event.preventDefault();
        const note = new FormData(event.currentTarget).get('note');
        action.run(async () => {
          const saved = await result(db.from('revisions').insert({submission_id:id,body:draft.trim(),note:note.trim()}).select('id').single());
          setMode('read');setVersion(saved.id);await refresh();
        });
      }}><label>Testo della revisione<textarea className="article-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={100000} required/></label><label>Nota sulla versione<input name="note" maxLength={4000}/></label><div className="actions"><button className="primary" disabled={action.working}>Salva revisione interna</button><button type="button" onClick={() => setMode('read')}>Annulla</button></div></form>
      : <>
        {revision && <div className="revision-meta"><span>{revision.note}</span>{staff && <button disabled={action.working} onClick={() => action.run(async () => {
          await result(db.from('revisions').update({shared:!revision.shared}).eq('id',revision.id).select('id').single());await refresh();
        })}>{revision.shared ? 'Rendi interna' : 'Condividi con l’autore'}</button>}</div>}
        {mode === 'diff' ? <div className="reading">{diffWordsWithSpace(item.original,currentText,{maxEditLength:3000})?.map((part,i) => part.added ? <ins key={i}>{part.value}</ins> : part.removed ? <del key={i}>{part.value}</del> : <React.Fragment key={i}>{part.value}</React.Fragment>) || 'Differenze troppo estese per il confronto in linea.'}</div>
          : currentText ? <div className="reading" ref={textRef} tabIndex={0} onMouseUp={selectAnchor} onKeyUp={selectAnchor}>{markedParts(currentText,currentComments).map((part,i) => part.highlighted ? <mark key={i}>{part.text}</mark> : <React.Fragment key={i}>{part.text}</React.Fragment>)}</div>
          : <dl className="facts">{serviceGroups.flatMap(([,fields]) => fields).filter(([key]) => item.fields[key]).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{item.fields[key]}</dd></div>)}</dl>}
        {currentText && mode === 'read' && <p className="muted">{currentText.length.toLocaleString('it-IT')} battute · Seleziona un passaggio per annotarlo.</p>}
      </>}
      {attachments.length > 0 && <div className="attachment-list"><h3>Allegati originali</h3>{attachments.map(file => <button key={file.name} onClick={() => action.run(() => download(file))}>{fileLabel(file.name)} ↓</button>)}</div>}
      </section>
      <aside className="panel notes"><h2>Commenti</h2><p className="muted">Per la versione selezionata</p>
        <div className="thread">{!currentComments.length && <p className="muted">Ancora nessun commento.</p>}{currentComments.map(msg => <div className="message" key={msg.id}>
          <div className="message-meta"><strong>{msg.staff_note ? 'Nota interna' : msg.from_staff ? 'Redazione' : 'Autore'}</strong><time>{fmt.format(new Date(msg.created_at))}</time></div>
          {msg.anchor && <blockquote>{msg.anchor}</blockquote>}<p>{msg.body}</p>
        </div>)}</div>
        <form onSubmit={event => {event.preventDefault();action.run(async () => {
          await result(db.from('comments').insert({submission_id:id,revision_id:revision?.id || null,body:comment.trim(),staff_note:staff && (staffNote || Boolean(revision && !revision.shared)),...anchor}));
          setComment('');setAnchor(null);setStaffNote(false);await refresh();
        });}}>
          {anchor && <div className="selection"><blockquote>{anchor.anchor}</blockquote><button type="button" onClick={() => setAnchor(null)}>Rimuovi selezione</button></div>}
          <label>{anchor ? 'Annota il passaggio' : 'Scrivi un commento'}<textarea value={comment} maxLength={8000} onChange={event => setComment(event.target.value)} required/></label>
          {staff && (revision && !revision.shared ? <p className="muted">Nota interna</p> : <label className="checkbox"><input type="checkbox" checked={staffNote} onChange={event => setStaffNote(event.target.checked)}/> Nota interna</label>)}
          <button className="primary" disabled={action.working || !comment.trim()}>Salva commento</button>
        </form>
      </aside>
    </div>
  </>;
}

export function Dashboard({user,role}) {
  const [view,setView] = useState(() => new URLSearchParams(location.search).get('invio') || 'list');
  const [items,setItems] = useState([]);
  const [filter,setFilter] = useState('');
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(0);
  const [next,setNext] = useState(false);
  const action = useAction();
  const staff = Boolean(role);
  function load() {
    return action.run(async () => {
      let query = db.from('submissions').select('*').order('created_at',{ascending:false}).order('id').range(page*25,page*25+25);
      if (filter) query = query.eq('status',filter);
      if (search.trim()) query = query.ilike('club','%' + search.trim().replaceAll('%','\\%').replaceAll('_','\\_') + '%');
      const entries = await result(query);
      setItems(entries.slice(0,25));
      setNext(entries.length > 25);
    });
  }
  useEffect(() => {if (view === 'list') load();},[view,filter,search,page]);
  const back = () => setView('list');
  return <main className="container">
    {view === 'list' ? <>
      <div className="page-heading"><div><p className="eyebrow">RIVISTA NAZIONALE LION</p><h1>{staff ? 'Scrivania di redazione' : 'I tuoi invii'}</h1><p>{staff ? 'Leggi, rivedi e segui i contributi dei club.' : 'Proponi un contributo e segui il lavoro della redazione.'}</p></div>
        {role === 'admin' && <button onClick={() => setView('team')}>Collaboratori</button>}</div>
      <div className="choices">
        <button onClick={() => setView('article')}><span className="tile-icon">¶</span><span><strong>{kinds.article}</strong><small>Invia un testo già scritto</small></span><span className="arrow">↗</span></button>
        <button onClick={() => setView('service')}><span className="tile-icon">✦</span><span><strong>{kinds.service}</strong><small>Raccogli fatti, numeri e testimonianze</small></span><span className="arrow">↗</span></button>
      </div>
      <section className="panel submissions">
        <div className="list-tools"><h2>{staff ? 'Invii alla redazione' : 'Cronologia'}</h2>
          <input aria-label="Cerca per club" placeholder="Cerca per club" value={search} onChange={event => {setPage(0);setSearch(event.target.value);}}/>
          <select aria-label="Filtra per stato" value={filter} onChange={event => {setPage(0);setFilter(event.target.value);}}><option value="">Tutti gli stati</option>{Object.entries(statuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
          <button onClick={load} disabled={action.working}>Aggiorna</button></div>
        <ErrorLine text={action.error}/>
        {!items.length && !action.error && <p className="empty">{action.working ? 'Caricamento…' : 'Nessun invio da mostrare.'}</p>}
        {items.map(item => <button className="submission" key={item.id} onClick={() => setView(item.id)}><span><strong>{headline(item)}</strong><small>{[item.club,item.district,kinds[item.kind]].filter(Boolean).join(' · ')}</small></span><time>{fmt.format(new Date(item.created_at))}</time><span className={'status '+item.status}>{statuses[item.status]}</span><span className="arrow">→</span></button>)}
        {(page > 0 || next) && <div className="actions paging"><button disabled={!page} onClick={() => setPage(page-1)}>Precedente</button><button disabled={!next} onClick={() => setPage(page+1)}>Successiva</button></div>}
      </section>
      {!staff && <details className="muted"><summary>Codice account per la redazione</summary><p><code>{user.id}</code></p></details>}
    </> : view === 'team' ? <Team back={back}/> : kinds[view] ? <Submit key={view} kind={view} user={user} open={setView} back={back}/> : <Detail key={view} id={view} staff={staff} back={back}/>}
  </main>;
}
