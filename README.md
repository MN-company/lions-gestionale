# Redazione LION

Portale editoriale per la rivista nazionale LION. Gli autori inviano articoli o schede di service, seguono gli stati e rispondono ai commenti. I redattori possono aprire gli invii, cambiare stato, confrontare versioni e condividere una revisione con l’autore. I commenti con una selezione di testo evidenziano il passaggio nella versione annotata. Le proposte AI e le note interne hanno una visibilità indipendente dagli stati editoriali.

## Avvio

1. Installa Node.js 22 o superiore e lancia `npm install`.
2. Copia `.env.example` in `.env.local` e imposta URL e chiave pubblicabile Supabase.
3. Applica le migrazioni in `supabase/migrations`. Il bucket allegati è privato e le tabelle applicano le politiche RLS.
4. Avvia con `npm run dev`. Per verificare la compilazione usa `npm run build`.

## Configurazione in produzione

- In Vercel usa il preset Vite, imposta le tre variabili e usa l’indirizzo pubblico canonico per `APP_ORIGIN`.
- In Supabase Auth imposta lo stesso indirizzo come Site URL. Configura SMTP se vuoi inviare conferme di registrazione o link di recupero password. Senza conferma l’indirizzo di registrazione è autodichiarato.
- Per assegnare il primo ruolo Direzione, chiedi alla persona di comunicarti direttamente il codice account mostrato nella sua scrivania dopo l’accesso. In SQL Editor usa quel codice.

```sql
insert into public.redazione_members (user_id, role)
values ('codice-account', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

La Direzione può autorizzare e revocare i redattori dalla sezione Collaboratori. Per autorizzare un redattore, inserisci il codice account che ti ha comunicato direttamente. Il ruolo si carica al prossimo accesso.

## Configurare il collegamento MCP

1. Abilita l’OAuth 2.1 Server Supabase, imposta `/oauth/consent` come percorso di autorizzazione e abilita la registrazione dinamica dei client, oppure registra i client consentiti.
2. Configura il connettore remoto Streamable HTTP con `https://<indirizzo-del-portale>/api/mcp` e accedi con un ruolo della redazione. Controlla nome e indirizzo di ritorno dell’app prima di autorizzarla.
3. Gli strumenti possono cercare e leggere gli invii, recuperare la linea editoriale, salvare proposte di revisione e scrivere note interne. La condivisione con l’autore, gli stati e i ruoli si gestiscono dalla scrivania web.
4. In ChatGPT la disponibilità delle azioni di scrittura dipende dal piano e dalle impostazioni del workspace. Claude è disponibile tramite connettore remoto nei piani che lo supportano.

L’importazione automatica del testo supporta DOCX e TXT. Gli altri formati possono essere allegati. Per la revisione di un articolo occorre anche un testo modificabile.

### Chiave MCP per Claude e ChatGPT

Nella scrivania vai a **Il mio account → Collegamento AI (MCP)** e genera una chiave. Il valore completo da copiare comincia con `Bearer`. Nel client imposta l’URL indicato e un header HTTP chiamato `Authorization` con quel valore. In Claude si trova in **Customize → Connectors → Add custom connector → Request headers**. Se il client chiede il tipo di autenticazione per questo flusso, seleziona la modalità senza login OAuth. Per un plugin nella chat di ChatGPT usa OAuth: la configurazione standard del plugin non offre un campo per un bearer statico. I client MCP con header configurabili devono inviare il valore ad ogni chiamata. La chiave scade dopo 90 giorni, si revoca dal portale e può operare solo finché l’account ha un ruolo di redazione. L’opzione OAuth rimane disponibile quando attiva in Supabase.

## Rilascio da GitHub

Il workflow `.github/workflows/production.yml` usa il branch `main`: esegue i test, compila su Vercel, applica le migrazioni Supabase e pubblica la build. In **Settings → Secrets and variables → Actions** occorrono `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `VERCEL_TOKEN` con accesso ai progetti indicati nel workflow. Una volta salvati, avvia il workflow **Redazione LION production** oppure pubblica un commit su `main`. I file di migrazione usano le versioni già registrate in produzione.
