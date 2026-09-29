import { useState, useRef, useEffect } from 'react';
import { ScanLine, Trash2, Package, ListChecks, MapPin } from 'lucide-react';
import './index.css';

function App() {
  const [items, setItems] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [location, setLocation] = useState('Almacén Principal');
  const inputRef = useRef(null);

  // Keep focus on the input for continuous scanning
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleScan = (e) => {
    if (e.key === 'Enter' && inputValue.trim() !== '') {
      const newCode = inputValue.trim();
      
      setItems((prevItems) => {
        // Check if item already exists in the same location to update quantity
        const existingIndex = prevItems.findIndex(item => item.code === newCode && item.location === location);
        if (existingIndex !== -1) {
          const updated = [...prevItems];
          updated[existingIndex].qty += 1;
          updated[existingIndex].timestamp = new Date().toISOString();
          // Move to top
          const item = updated.splice(existingIndex, 1)[0];
          return [item, ...updated];
        } else {
          return [
            {
              id: Date.now().toString(),
              code: newCode,
              qty: 1,
              location: location,
              timestamp: new Date().toISOString(),
            },
            ...prevItems
          ];
        }
      });
      
      setInputValue('');
      // Keep focus after scan
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 10);
    }
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter(item => item.id !== id));
    if (inputRef.current) inputRef.current.focus();
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>TecnoKardex</h1>
        <p>Control de inventario rápido</p>
      </header>

      <section className="glass-panel">
        <div className="input-group" style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={18} /> Ubicación / Almacén
          </label>
          <input
            type="text"
            className="scanner-input"
            style={{ fontSize: '1rem', padding: '0.75rem', background: 'rgba(15, 23, 42, 0.4)' }}
            placeholder="Ej: Estante A..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ScanLine size={18} /> Escanear Código o Serial
          </label>
          <input
            ref={inputRef}
            type="text"
            className="scanner-input"
            placeholder="Pista: usa la pistola de barras..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleScan}
            autoFocus
          />
        </div>
      </section>

      <section className="glass-panel" style={{ flex: 1 }}>
        <div className="list-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListChecks size={20} /> Registros
          </h2>
          <span className="badge">{items.length} items</span>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
            <Package size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
            <p>Aún no hay lecturas.<br/>Escanea un código para empezar.</p>
          </div>
        ) : (
          <div className="item-list">
            {items.map((item) => (
              <div key={item.id} className="item-card">
                <div className="item-details">
                  <span className="item-code">{item.code}</span>
                  <span className="item-time" style={{ color: '#93c5fd' }}><MapPin size={12} style={{ display: 'inline', marginRight: '4px' }}/>{item.location} • {formatDate(item.timestamp)}</span>
                </div>
                <div className="item-actions">
                  <span className="qty-badge">x{item.qty}</span>
                  <button onClick={() => removeItem(item.id)} className="btn-icon" aria-label="Eliminar">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
