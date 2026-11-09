import { setState, useApp } from "../store";

export function ToastView() {
  const toast = useApp((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          className="btn link"
          onClick={() => {
            toast.undo?.();
            setState({ toast: null });
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
