import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import { api, persistSession } from "../api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await api.login({ email, password });
      persistSession(data.token);
      navigate("/dashboard");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to manage leads, campaigns, and billing.">
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          placeholder="Email"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          required
          placeholder="Password"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
        />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-70"
        >
          {loading ? "Signing in..." : "Login"}
        </button>
      </form>
      <p className="text-sm text-slate-300">
        No account yet? <Link to="/register" className="text-cyan-300">Register</Link>
      </p>
    </AuthLayout>
  );
}