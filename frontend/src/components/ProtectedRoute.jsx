import { Navigate } from "react-router-dom";
import { hasSession } from "../api";

export default function ProtectedRoute({ children }) {
  if (!hasSession()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}