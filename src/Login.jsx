import { useState } from "react";
import { supabase } from "./supabaseClient";

const styles = {
  wrapper: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0F1117",
  },
  card: {
    background: "#1A1D27",
    padding: "2rem",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "360px",
  },
  title: { color: "#00D4AA", margin: 0, fontSize: "1.8rem", fontWeight: 700 },
  subtitle: { color: "#aaa", marginBottom: "1.5rem" },
  input: {
    display: "block",
    width: "100%",
    padding: "0.75rem",
    marginBottom: "1rem",
    borderRadius: "8px",
    border: "1px solid #333",
    background: "#0F1117",
    color: "#fff",
    fontSize: "1rem",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "0.75rem",
    background: "#00D4AA",
    color: "#0F1117",
    border: "none",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "1rem",
    cursor: "pointer",
  },
  error: { color: "#FF4757", marginBottom: "1rem", fontSize: "0.9rem" },
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("Email ou mot de passe incorrect.");
    setLoading(false);
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h2 style={styles.title}>Momtaz</h2>
        <p style={styles.subtitle}>Connexion</p>
        <form onSubmit={handleLogin}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
