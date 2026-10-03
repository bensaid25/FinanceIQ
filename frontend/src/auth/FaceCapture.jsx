import React, { useEffect, useRef, useState, useCallback } from 'react';
import AuthLayout from './AuthLayout';
import { enrollFace, verifyFace, errorMessage } from './authApi';

const ENROLL_COUNT = 5;
const POSES = [
  'Regardez droit devant',
  'Tournez très légèrement la tête à gauche',
  'Tournez très légèrement la tête à droite',
  'Relevez un peu le menton',
  'Souriez légèrement',
];

/* Caméra : le flux est arrêté au démontage (ref, pas d'état périmé).
   L'aperçu est miroir en CSS seulement ; l'image envoyée n'est PAS retournée. */
function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState('starting');   // starting | ready | error

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }, audio: false,
        });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const snap = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);

    // luminosité moyenne sur une miniature : avertit si l'image est trop sombre
    const t = document.createElement('canvas');
    t.width = 32; t.height = 24;
    const tc = t.getContext('2d');
    tc.drawImage(c, 0, 0, 32, 24);
    const px = tc.getImageData(0, 0, 32, 24).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const brightness = sum / (px.length / 4);

    return { data: c.toDataURL('image/jpeg', 0.85), dark: brightness < 55 };
  }, []);

  return { videoRef, state, snap };
}

function Camera({ cam, tone, note, children }) {
  return (
    <div className={`fq-cam ${tone || ''}`}>
      <video ref={cam.videoRef} autoPlay muted playsInline />
      <div className="fq-oval"><div /></div>
      {cam.state === 'starting' && <div className="fq-cam-center">Démarrage de la caméra…</div>}
      {cam.state === 'error' && (
        <div className="fq-cam-center">
          Caméra inaccessible. Autorisez-la dans le navigateur (icône à gauche de l'adresse), puis rechargez la page.
        </div>
      )}
      {note ? <div className="fq-cam-note">{note}</div> : null}
      {children}
    </div>
  );
}

/* ── Étape 2 : vérification du visage ───────────────────────── */
function VerifyFace({ token, username, onDone, onExpired, onBack }) {
  const cam = useCamera();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);          // { type, text }
  const [left, setLeft] = useState(null);
  const [tone, setTone] = useState('');

  const run = async () => {
    const shot = cam.snap();
    if (!shot || busy) return;
    setBusy(true); setTone('busy'); setMsg({ type: 'info', text: 'Analyse en cours…' });
    try {
      const res = await verifyFace(token, shot.data);
      if (res.authenticated) {
        setTone('ok');
        setMsg({ type: 'ok', text: 'Visage reconnu. Ouverture de votre espace…' });
        setTimeout(() => onDone(res), 700);
        return;
      }
      setTone('bad');
      setLeft(res.attempts_left);
      if (res.attempts_left === 0) {
        onExpired('Trop de tentatives. Reconnectez-vous avec votre mot de passe.');
        return;
      }
      setMsg({
        type: 'err',
        text: `${res.message}${shot.dark ? ' L\'image semble sombre : ajoutez de la lumière.' : ''}`,
      });
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403 || status === 429) {
        onExpired(errorMessage(err) === 'Session invalide ou expirée'
          ? 'La vérification a expiré. Reconnectez-vous.' : errorMessage(err));
        return;
      }
      setTone('bad');
      setMsg({ type: 'err', text: errorMessage(err) });
    }
    setBusy(false);
    setTimeout(() => setTone(''), 1800);
  };

  return (
    <AuthLayout
      step={2}
      title="Vérification du visage"
      subtitle={`Bonjour ${username}. Regardez la caméra pour confirmer votre identité.`}
      footer={<button type="button" className="fq-link" onClick={onBack}>← Retour à la connexion</button>}
    >
      {msg ? <div className={`fq-msg ${msg.type}`} role="status">{msg.text}</div> : null}
      <Camera cam={cam} tone={tone} note="Placez votre visage dans l'ovale, bien éclairé" />
      <button className="fq-btn" onClick={run} disabled={cam.state !== 'ready' || busy}>
        {busy ? 'Vérification…' : 'Vérifier mon visage'}
      </button>
      {left !== null && left > 0 ? (
        <div className="fq-hint" style={{ textAlign: 'center', marginTop: 12 }}>
          {left} tentative{left > 1 ? 's' : ''} restante{left > 1 ? 's' : ''}
        </div>
      ) : null}
    </AuthLayout>
  );
}

/* ── Enregistrement du visage (après inscription) ───────────── */
function EnrollFace({ token, username, onDone, onExpired, onBack }) {
  const cam = useCamera();
  const [shots, setShots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const full = shots.length >= ENROLL_COUNT;

  const capture = () => {
    if (full || cam.state !== 'ready') return;
    const shot = cam.snap();
    if (!shot) return;
    setShots(s => [...s, shot.data]);
    setMsg(shot.dark ? { type: 'info', text: "Cette photo est sombre : placez-vous face à une source de lumière." } : null);
  };

  const save = async () => {
    setBusy(true); setMsg({ type: 'info', text: 'Analyse des photos…' });
    try {
      await enrollFace(token, shots);
      onDone();
    } catch (err) {
      if (err.response?.status === 401) { onExpired("La session d'enregistrement a expiré. Reconnectez-vous."); return; }
      setMsg({ type: 'err', text: errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Enregistrez votre visage"
      subtitle={`${username}, prenez ${ENROLL_COUNT} photos en variant légèrement la position. Elles serviront à vous reconnaître à chaque connexion.`}
      footer={<button type="button" className="fq-link" onClick={onBack}>Plus tard</button>}
    >
      {msg ? <div className={`fq-msg ${msg.type}`} role="status">{msg.text}</div> : null}

      <Camera cam={cam} note={full ? 'Photos prêtes' : POSES[shots.length]} />

      <div className="fq-thumbs" aria-label="Photos prises">
        {Array.from({ length: ENROLL_COUNT }).map((_, i) => (
          <div key={i} className={`fq-thumb ${shots[i] ? 'full' : i === shots.length ? 'current' : ''}`}>
            {shots[i] ? <img src={shots[i]} alt={`Photo ${i + 1}`} /> : i + 1}
          </div>
        ))}
      </div>

      {!full ? (
        <button className="fq-btn" onClick={capture} disabled={cam.state !== 'ready'}>
          Prendre la photo {shots.length + 1} / {ENROLL_COUNT}
        </button>
      ) : (
        <div className="fq-row">
          <button className="fq-btn secondary" onClick={() => { setShots([]); setMsg(null); }} disabled={busy}>Recommencer</button>
          <button className="fq-btn" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      )}
    </AuthLayout>
  );
}

export default function FaceCapture({ mode, ...props }) {
  return mode === 'enroll' ? <EnrollFace {...props} /> : <VerifyFace {...props} />;
}
