# Redazione LION

Portale editoriale per la rivista nazionale LION. Gli autori inviano articoli o schede di service, seguono gli stati e rispondono ai commenti. I redattori possono aprire gli invii, cambiare stato, confrontare versioni e condividere una revisione con l’autore. I commenti con una selezione di testo evidenziano il passaggio nella versione annotata. Le proposte AI e le note interne hanno una visibilità indipendente dagli stati editoriali.

## Avvio

1. Installa Node.js 22 o superiore e lancia `npm install`.
2. Copia `.env.example` in `.env.local` e imposta URL e chiave pubblicabile Supabase.
3. Applica le migrazioni in `supabase/migrations`. Il bucket allegati è privato e le tabelle applicano le politiche RLS.
4. Avvia con `npm run dev`. Per verificare la compilazione usa `npm run build`.

## Configurazione in produzione

- In Vercel usa il preset Vite, imposta le tre variabili e usa l’indirizzo pubblico canonico per `APP_ORIGIN`.
- In Supabase Auth imposta lo stesso indirizzo come Site URL e tieni la conferma email attiva. Configura un mittente verificato con SMTP personalizzato per le email di conferma e recupero password. Il servizio email predefinito è riservato agli indirizzi del team Supabase.
- Per assegnare il primo ruolo Direzione, la persona deve registrarsi e confermare la propria email. In SQL Editor esegui la seguente query dopo aver sostituito l’indirizzo. Disconnetti e riconnetti l’account per caricare il ruolo.

```sql
insert into public.redazione_members (user_id, role)
select id, 'admin' from auth.users
where lower(email) = 'indirizzo-verificato@example.org'
  and email_confirmed_at is not null
on conflict (user_id) do update set role = excluded.role;
```

La Direzione può autorizzare e revocare i redattori dalla sezione Collaboratori. L’autorizzazione si applica al successivo accesso con l’indirizzo verificato. Il link al portale può essere condiviso dalla Direzione.

## Configurare il collegamento MCP

1. Abilita l’OAuth 2.1 Server Supabase, imposta `/oauth/consent` come percorso di autorizzazione e abilita la registrazione dinamica dei client, oppure registra i client consentiti.
2. Configura il connettore remoto Streamable HTTP con `https://<indirizzo-del-portale>/api/mcp` e accedi con un ruolo della redazione. Controlla nome e indirizzo di ritorno dell’app prima di autorizzarla.
3. Gli strumenti possono cercare e leggere gli invii, recuperare la linea editoriale, salvare proposte di revisione e scrivere note interne. La condivisione con l’autore, gli stati e i ruoli si gestiscono dalla scrivania web.
4. In ChatGPT la disponibilità delle azioni di scrittura dipende dal piano e dalle impostazioni del workspace. Claude è disponibile tramite connettore remoto nei piani che lo supportano.

L’importazione automatica del testo supporta DOCX e TXT. Gli altri formati possono essere allegati. Per la revisione di un articolo occorre anche un testo modificabile.
