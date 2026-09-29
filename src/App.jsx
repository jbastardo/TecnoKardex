import { useState, useRef, useEffect, useCallback } from 'react';
import { ScanLine, Trash2, Package, ListChecks, MapPin, Camera, X, Plus, CheckCircle2, Download } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import * as XLSX from 'xlsx';
import './index.css';

function App() {
  const [items, setItems] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [location, setLocation] = useState('Almacén Principal');
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const inputRef = useRef(null);
  // Guardar un ref para el escáner para poder detenerlo bien
  const html5QrCodeRef = useRef(null);

  // Focus físico
  useEffect(() => {
    if (inputRef.current && !isCameraActive) {
      inputRef.current.focus();
    }
  }, [isCameraActive, activeItem]);

  // Manejador central de escaneos
  const handleScannedCode = useCallback((newCode) => {
    setItems((prevItems) => {
      // Función pura para calcular el nuevo estado basado en prevItems
      let activeItemEnCierre = null;
      setItems(currentItems => {
        // En este bloque no podemos hacer el return de setItems directamente con otra llamada,
        // pero podemos leer el estado actual. Mejor calculamos todo con prevItems.
        return currentItems;
      });

      // Primero, obtenemos el activeItem actual
      setActiveItem((currentActive) => {
        activeItemEnCierre = currentActive;
        return currentActive;
      });

      // Protección: Si la cámara lee el mismo SKU de nuevo
      if (activeItemEnCierre && activeItemEnCierre.code === newCode) {
        return prevItems;
      }

      if (!activeItemEnCierre) {
        let existingSku = prevItems.find(item => item.code === newCode && item.location === location);
        
        if (existingSku) {
          setActiveItem(existingSku);
          return prevItems;
        } else {
          const newItem = {
            id: Date.now().toString() + Math.random().toString(),
            code: newCode,
            qty: 0,
            location: location,
            serials: [],
            timestamp: new Date().toISOString(),
          };
          setActiveItem(newItem);
          return [newItem, ...prevItems];
        }
      } else {
        const isDuplicate = prevItems.some(item => item.serials.includes(newCode));
        
        if (isDuplicate) {
          if (!isCameraActive) {
            alert(`⚠️ El serial "${newCode}" ya fue contado previamente.`);
          }
          return prevItems;
        }

        return prevItems.map(item => {
          if (item.id === activeItemEnCierre.id) {
            const updatedItem = {
              ...item,
              qty: item.qty + 1,
              serials: [...item.serials, newCode],
              timestamp: new Date().toISOString()
            };
            setActiveItem(updatedItem);
            return updatedItem;
          }
          return item;
        });
      }
    });
  }, [location, isCameraActive]);

  // Lógica del motor HTML5 QrCode
  useEffect(() => {
    if (isCameraActive) {
      // Inicializar el escáner en el div 'reader'
      html5QrCodeRef.current = new Html5Qrcode("reader");
      
      html5QrCodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 15,    // Escanea 15 veces por segundo (súper rápido)
          qrbox: { width: 300, height: 100 }, // Rectángulo horizontal perfecto para Code128
          aspectRatio: 1.777778 // Fuerza la cámara a 16:9 HD
        },
        (decodedText) => {
          handleScannedCode(decodedText);
          if (navigator.vibrate) navigator.vibrate(100);
        },
        (errorMessage) => {
          // Ignorar errores de "no se detectó código en este frame"
        }
      ).catch((err) => {
        console.error("Error al iniciar la cámara: ", err);
        alert("No se pudo iniciar la cámara. Revisa los permisos.");
        setIsCameraActive(false);
      });
    } else {
      // Detener y limpiar si se apaga la cámara
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().then(() => {
          html5QrCodeRef.current.clear();
          html5QrCodeRef.current = null;
        }).catch(err => console.error(err));
      }
    }

    // Cleanup on unmount
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().then(() => html5QrCodeRef.current.clear()).catch(e => console.error(e));
      }
    };
  }, [isCameraActive, handleScannedCode]);

  const handleScan = (e) => {
    if (e.key === 'Enter' && inputValue.trim() !== '') {
      handleScannedCode(inputValue.trim());
      setInputValue('');
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 10);
    }
  };

  const addQuantityWithoutSerial = () => {
    if (!activeItem) return;
    setItems(prevItems => {
      return prevItems.map(item => {
        if (item.id === activeItem.id) {
          const updatedItem = {
            ...item,
            qty: item.qty + 1,
            timestamp: new Date().toISOString()
          };
          setActiveItem(updatedItem);
          return updatedItem;
        }
        return item;
      });
    });
    if (inputRef.current) inputRef.current.focus();
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter(item => item.id !== id));
    if (activeItem && activeItem.id === id) setActiveItem(null);
    if (inputRef.current && !isCameraActive) inputRef.current.focus();
  };

  const exportToExcel = () => {
    const exportData = [];
    items.forEach(item => {
      if (item.serials.length > 0) {
        item.serials.forEach(serial => {
          exportData.push({ Ubicacion: item.location, SKU: item.code, Serial: serial, Cantidad: 1, Fecha: new Date(item.timestamp).toLocaleString() });
        });
      } else {
        exportData.push({ Ubicacion: item.location, SKU: item.code, Serial: "N/A", Cantidad: item.qty, Fecha: new Date(item.timestamp).toLocaleString() });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    XLSX.writeFile(workbook, `Conteo_Kardex_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>TecnoKardex</h1>
        <p>Control de inventario profesional</p>
      </header>

      {/* ZONA DE ESCANEO */}
      <section className="glass-panel" style={{ border: activeItem ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.1)' }}>
        
        {/* Cabecera / Ubicación */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          
          {!activeItem ? (
            <div className="input-group" style={{ flex: 1 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={18} /> Ubicación Actual
              </label>
              <input
                type="text"
                className="scanner-input"
                style={{ fontSize: '1rem', padding: '0.5rem', background: 'rgba(15, 23, 42, 0.4)' }}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          ) : (
             <div style={{ flex: 1, color: 'var(--text-secondary)' }}>
                <small>Modo: Escaneo de Seriales</small>
             </div>
          )}

          <button 
            onClick={() => setIsCameraActive(!isCameraActive)}
            className="btn-icon" 
            style={{ 
              background: isCameraActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)', 
              color: isCameraActive ? 'var(--danger)' : '#93c5fd',
              marginLeft: '1rem'
            }}
          >
            {isCameraActive ? <X size={20} /> : <Camera size={20} />}
          </button>
        </div>

        {/* Input Físico / Cámara Horizontal */}
        <div className="input-group" style={{ marginBottom: '1rem' }}>
          
          {isCameraActive ? (
            <div style={{ 
              borderRadius: '0.75rem', 
              overflow: 'hidden', 
              border: '2px solid var(--accent)', 
              background: '#000'
            }}>
              {/* Contenedor oficial de html5-qrcode */}
              <div id="reader" style={{ width: '100%', minHeight: '200px' }}></div>
              
              <div style={{ padding: '0.5rem', textAlign: 'center', color: 'white', background: '#0f172a'}}>
                <small style={{ fontWeight: 'bold' }}>{activeItem ? 'Apunta al SERIAL (centrado en el cuadro)' : 'Apunta al SKU (centrado en el cuadro)'}</small>
              </div>
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              className="scanner-input"
              placeholder={activeItem ? "Pistola: Lee el SERIAL aquí..." : "Pistola: Lee el SKU aquí..."}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleScan}
            />
          )}
        </div>

        {/* Info del SKU activo y botón Finalizar */}
        {activeItem && (
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#93c5fd' }}>SKU: {activeItem.code}</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Total: {activeItem.qty}</span>
              <button 
                onClick={addQuantityWithoutSerial}
                style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                <Plus size={18} /> +1 Sin Serial
              </button>
            </div>
            
            <button 
              onClick={() => setActiveItem(null)} 
              style={{ 
                width: '100%', 
                background: '#10b981', 
                color: 'white', 
                border: 'none', 
                padding: '0.75rem', 
                borderRadius: '0.5rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: '0.5rem', 
                fontWeight: 'bold',
                fontSize: '1.1rem',
                cursor: 'pointer'
              }}
            >
              <CheckCircle2 size={20} /> Terminar este SKU
            </button>
          </div>
        )}
      </section>

      {/* LISTA DE REGISTROS */}
      <section className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="list-header" style={{ marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListChecks size={20} /> Resumen
          </h2>
          {items.length > 0 && (
            <button 
              onClick={exportToExcel}
              style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
              <Download size={18} /> Excel
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
            <Package size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
            <p>Aún no hay lecturas.<br/>Escanea un SKU para empezar.</p>
          </div>
        ) : (
          <div className="item-list" style={{ flex: 1, overflowY: 'auto' }}>
            {items.map((item) => (
              <div key={item.id} className="item-card" style={{ borderLeft: activeItem?.id === item.id ? '4px solid var(--accent)' : 'none' }}>
                <div className="item-details">
                  <span className="item-code" style={{ fontSize: '1.1rem' }}>SKU: {item.code}</span>
                  <span className="item-time" style={{ color: '#93c5fd' }}>
                    <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }}/>{item.location} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  
                  {item.serials.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <strong>Seriales ({item.serials.length}):</strong> {item.serials.slice(-3).join(', ')} {item.serials.length > 3 ? '...' : ''}
                    </div>
                  )}
                </div>
                <div className="item-actions">
                  <span className="qty-badge" style={{ fontSize: '1.2rem', padding: '0.5rem' }}>x{item.qty}</span>
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
