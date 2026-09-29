import { useState, useRef, useEffect, useCallback } from 'react';
import { ScanLine, Trash2, Package, ListChecks, MapPin, Camera, X, Plus, CheckCircle2, Download, Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library';
import * as XLSX from 'xlsx';
import './index.css';

function App() {
  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem('tecnoKardexItems');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  
  const [masterDb, setMasterDb] = useState(() => {
    const saved = localStorage.getItem('tecnoKardexMasterDB');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  
  const [toast, setToast] = useState({ message: '', type: 'info', visible: false });
  const fileInputRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 4000); // 4 segundos para que se lea bien
  }, []);
  
  const [activeItem, setActiveItem] = useState(null);
  const activeItemRef = useRef(null); // Ref para evitar bugs de estado asíncrono
  const [inputValue, setInputValue] = useState('');
  
  const [location, setLocation] = useState(() => {
    return localStorage.getItem('tecnoKardexLocation') || 'Almacén Principal';
  });
  
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const inputRef = useRef(null);
  const videoRef = useRef(null);

  // Auto-guardado en el navegador (Local Storage)
  useEffect(() => {
    localStorage.setItem('tecnoKardexItems', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('tecnoKardexMasterDB', JSON.stringify(masterDb));
  }, [masterDb]);

  useEffect(() => {
    localStorage.setItem('tecnoKardexLocation', location);
  }, [location]);

  // Mantener el Ref sincronizado con el estado
  useEffect(() => {
    activeItemRef.current = activeItem;
  }, [activeItem]);

  // Focus físico
  useEffect(() => {
    if (inputRef.current && !isCameraActive) {
      inputRef.current.focus();
    }
  }, [isCameraActive, activeItem]);

  // Manejador central de escaneos
  const handleScannedCode = useCallback((rawCode) => {
    // 1. Limpiar prefijos de metadata GS1 (AIM Symbology Identifiers) como ]C1, ]d2, etc.
    const cleanCode = rawCode.replace(/^\][A-Za-z0-9]{2}/, '');
    
    // Buscar en la Base de Datos Maestra
    const foundProduct = masterDb.find(p => 
      String(p.SKU) === cleanCode || 
      String(p.Codigo_Alterno1) === cleanCode || 
      String(p.Codigo_Alterno2) === cleanCode
    );
    
    const itemCode = foundProduct ? String(foundProduct.SKU) : cleanCode;
    const itemName = foundProduct ? foundProduct.Nombre : '';
    
    const currentActiveItem = activeItemRef.current;

    // 2. Si ya hay un SKU activo y la cámara dispara rápido el mismo código del SKU, lo ignoramos
    if (currentActiveItem && currentActiveItem.code === itemCode) {
      return;
    }

    if (!currentActiveItem) {
      // 3. No hay SKU activo -> El escaneo es un SKU
      setItems((prevItems) => {
        let existingSku = prevItems.find(item => item.code === itemCode && item.location === location);
        
        if (existingSku) {
          // Actualizar nombre si no lo tenía y ahora sí
          if (!existingSku.name && itemName) {
            existingSku.name = itemName;
          }
          setActiveItem(existingSku);
          return [...prevItems]; // forzar re-render
        } else {
          const newItem = {
            id: Date.now().toString() + Math.random().toString(),
            code: itemCode,
            name: itemName,
            qty: 0,
            location: location,
            serials: [],
            timestamp: new Date().toISOString(),
          };
          setActiveItem(newItem);
          return [newItem, ...prevItems];
        }
      });
    } else {
      // 4. Ya hay SKU activo -> El escaneo es un SERIAL o MULTIPLES SERIALES (ej. desde un QR)
      const scannedCodes = cleanCode.split(/[\s,]+/).filter(Boolean); // Separar por espacios, saltos de línea o comas
      
      setItems((prevItems) => {
        const newSerials = [];
        let duplicateCount = 0;
        
        for (const code of scannedCodes) {
           const isDuplicate = prevItems.some(item => item.serials.includes(code));
           if (isDuplicate) {
             duplicateCount++;
           } else {
             newSerials.push(code);
           }
        }
        
        if (newSerials.length === 0) {
           showToast(`⚠️ ${duplicateCount > 1 ? "Todos los seriales escaneados" : "El serial escaneado"} ya fueron ingresados previamente.`, 'error');
           if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
           return prevItems;
        }

        if (duplicateCount > 0) {
           showToast(`⚠️ ${duplicateCount} serial(es) ya contados previamente. Agregando ${newSerials.length} nuevos.`, 'warning');
           if (navigator.vibrate) navigator.vibrate(200);
        } else {
           showToast(`✅ Agregado(s) correctamente.`, 'success');
           if (navigator.vibrate) navigator.vibrate(100);
        }

        return prevItems.map(item => {
          if (item.id === currentActiveItem.id) {
            const updatedItem = {
              ...item,
              qty: item.qty + newSerials.length,
              serials: [...item.serials, ...newSerials],
              timestamp: new Date().toISOString()
            };
            setActiveItem(updatedItem);
            return updatedItem;
          }
          return item;
        });
      });
    }
  }, [location, isCameraActive, masterDb, showToast]);

  // Motor de Escaneo Personalizado (Usa IA Nativa del Celular si está disponible)
  useEffect(() => {
    let stream = null;
    let animationFrameId = null;
    let codeReader = null;
    let isScanning = true;

    const startScanner = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: "environment", 
            width: { ideal: 1920 }, 
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" }]
          }
        });

        if (videoRef.current && isScanning) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", true);
          videoRef.current.play();

          // Función para procesar cuando encuentra un código
          const onDecode = (text) => {
            if (!isScanning) return;
            handleScannedCode(text);
            if (navigator.vibrate) navigator.vibrate(100);
          };

          // 1. INTENTAR CON EL MOTOR NATIVO
          if ('BarcodeDetector' in window) {
             const barcodeDetector = new window.BarcodeDetector({ 
               formats: ['code_128', 'ean_13', 'qr_code', 'code_39', 'data_matrix', 'itf'] 
             });
             
             const detectLoop = async () => {
               if (!isScanning || !videoRef.current) return;
               try {
                  const barcodes = await barcodeDetector.detect(videoRef.current);
                  if (barcodes.length > 0) {
                     onDecode(barcodes[0].rawValue);
                  }
               } catch (e) {
                  // Ignorar errores de frame vacío
               }
               
               if (isScanning) {
                  setTimeout(() => {
                     animationFrameId = requestAnimationFrame(detectLoop);
                  }, 200); // 200ms delay para evitar escaneos ultra repetitivos
               }
             };
             detectLoop();
          } 
          else {
             const hints = new Map();
             hints.set(DecodeHintType.POSSIBLE_FORMATS, [
               BarcodeFormat.CODE_128, 
               BarcodeFormat.EAN_13, 
               BarcodeFormat.QR_CODE,
               BarcodeFormat.CODE_39
             ]);
             codeReader = new BrowserMultiFormatReader(hints);
             codeReader.timeBetweenDecodingAttempts = 200;
             
             codeReader.decodeFromVideoElement(videoRef.current, (result, err) => {
               if (result && isScanning) {
                 onDecode(result.getText());
               }
             });
          }
        }
      } catch (err) {
        console.error("Error al iniciar cámara: ", err);
        alert("No se pudo iniciar la cámara. Verifica los permisos.");
        setIsCameraActive(false);
      }
    };

    if (isCameraActive) {
      startScanner();
    }

    return () => {
      isScanning = false;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (codeReader) {
        codeReader.reset();
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
    if (inputRef.current && !isCameraActive) inputRef.current.focus();
  };

  const setManualQuantity = () => {
    if (!activeItem) return;
    const qtyStr = prompt(`Ingresa la cantidad total contada para el SKU ${activeItem.code}:`);
    if (qtyStr !== null && qtyStr.trim() !== '' && !isNaN(qtyStr)) {
      const parsedQty = parseInt(qtyStr, 10);
      if (parsedQty >= 0) {
        setItems(prevItems => {
          return prevItems.map(item => {
            if (item.id === activeItem.id) {
              const updatedItem = {
                ...item,
                qty: parsedQty, // Sobrescribe la cantidad
                timestamp: new Date().toISOString()
              };
              setActiveItem(updatedItem);
              return updatedItem;
            }
            return item;
          });
        });
      }
    }
    if (inputRef.current && !isCameraActive) inputRef.current.focus();
  };

  const removeSerial = (skuId, serialToRemove) => {
    setItems(prevItems => {
      return prevItems.map(item => {
        if (item.id === skuId) {
          const updatedItem = {
            ...item,
            qty: item.qty - 1,
            serials: item.serials.filter(s => s !== serialToRemove),
            timestamp: new Date().toISOString()
          };
          if (activeItemRef.current && activeItemRef.current.id === skuId) {
            setActiveItem(updatedItem);
          }
          return updatedItem;
        }
        return item;
      });
    });
    if (inputRef.current && !isCameraActive) inputRef.current.focus();
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
          exportData.push({ 
            Ubicacion: item.location, 
            SKU: item.code, 
            Nombre: item.name || "",
            Serial: serial, 
            Cantidad: 1, 
            Fecha: new Date(item.timestamp).toLocaleString() 
          });
        });
      } else {
        exportData.push({ 
          Ubicacion: item.location, 
          SKU: item.code, 
          Nombre: item.name || "",
          Serial: "N/A", 
          Cantidad: item.qty, 
          Fecha: new Date(item.timestamp).toLocaleString() 
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    XLSX.writeFile(workbook, `Conteo_Kardex_${new Date().toISOString().split('T')[0]}.xlsx`);
  };
  
  const downloadTemplateDB = () => {
    const templateData = [
      { SKU: "PROD-001", Codigo_Alterno1: "7501234567890", Codigo_Alterno2: "12345", Nombre: "Laptop Dell XPS 13", Inventario_Inicial: 50 },
      { SKU: "PROD-002", Codigo_Alterno1: "7501234567891", Codigo_Alterno2: "", Nombre: "Monitor LG 27\"", Inventario_Inicial: 30 }
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MaestroDB");
    XLSX.writeFile(workbook, "Plantilla_Maestro_DB.xlsx");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        if (data.length > 0 && (data[0].SKU !== undefined || data[0].sku !== undefined)) {
          // Normalizar las llaves si es necesario (asumimos que usaron la plantilla)
          setMasterDb(data);
          showToast(`✅ Base de datos cargada con ${data.length} productos.`, 'success');
        } else {
          showToast("❌ El archivo no tiene el formato correcto. Faltan columnas como SKU.", 'error');
        }
      } catch (err) {
        showToast("❌ Error al procesar el archivo Excel.", 'error');
      }
      e.target.value = ''; // limpiar input
    };
    reader.readAsBinaryString(file);
  };

  const clearInventory = () => {
    if (items.length === 0) return;
    if (window.confirm("⚠️ ¿Estás seguro de que deseas ELIMINAR todos los registros actuales y empezar una toma nueva? Asegúrate de haber descargado el Excel primero.")) {
      setItems([]);
      setActiveItem(null);
      if (inputRef.current && !isCameraActive) inputRef.current.focus();
    }
  };

  return (
    <div className="app-container">
      {/* Sistema de Toasts */}
      {toast.visible && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: toast.type === 'error' ? 'var(--danger)' : toast.type === 'warning' ? '#f59e0b' : '#10b981',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontWeight: 'bold',
          animation: 'fadeInDown 0.3s ease-out'
        }}>
          {toast.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          {toast.message}
        </div>
      )}

      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>TecnoKardex</h1>
          <p>Control de inventario profesional</p>
        </div>
        
        {/* Controles de DB Maestra */}
        <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column', alignItems: 'flex-end' }}>
           <input 
             type="file" 
             accept=".xlsx, .xls" 
             style={{ display: 'none' }} 
             ref={fileInputRef}
             onChange={handleFileUpload}
           />
           <button 
             onClick={() => fileInputRef.current?.click()}
             style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.4rem 0.75rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}
             title="Cargar BD Maestra con SKUs y Códigos Alternos"
           >
             <Upload size={16} /> Subir BD Maestra
           </button>
           
           <button 
             onClick={downloadTemplateDB}
             style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', padding: '0', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
           >
             <FileSpreadsheet size={14} /> Descargar plantilla Excel
           </button>
        </div>
      </header>

      <section className="glass-panel" style={{ border: activeItem ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.1)' }}>
        
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

          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
            <button 
              onClick={() => setIsCameraActive(!isCameraActive)}
              className="btn-icon" 
              style={{ 
                background: isCameraActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)', 
                color: isCameraActive ? 'var(--danger)' : '#93c5fd'
              }}
            >
              {isCameraActive ? <X size={20} /> : <Camera size={20} />}
            </button>
          </div>
        </div>

        <div className="input-group" style={{ marginBottom: '1rem' }}>
          
          {isCameraActive ? (
            <div style={{ 
              borderRadius: '0.75rem', 
              overflow: 'hidden', 
              border: '2px solid var(--accent)', 
              position: 'relative',
              height: '140px', // Rectángulo horizontal perfecto (tipo pistola láser)
              background: '#000'
            }}>
              <video 
                ref={videoRef} 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover' // Obliga al video a llenar el rectángulo apaisado sin distorsionarse
                }} 
              />
              
              {/* Láser Rojo Guía */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '10%',
                right: '10%',
                height: '2px',
                background: 'rgba(239, 68, 68, 0.9)',
                boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
                transform: 'translateY(-50%)',
                zIndex: 10
              }} />
              
              <div style={{ position: 'absolute', bottom: '6px', width: '100%', textAlign: 'center', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.8)', zIndex: 10}}>
                <small style={{ fontWeight: 'bold' }}>{activeItem ? 'Alinea el SERIAL con la línea roja' : 'Alinea el SKU con la línea roja'}</small>
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

        {activeItem && (
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <h3 style={{ margin: '0 0 0.25rem 0', color: '#93c5fd' }}>SKU: {activeItem.code}</h3>
            {activeItem.name && <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{activeItem.name}</p>}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Total: {activeItem.qty}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={addQuantityWithoutSerial}
                  style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                  <Plus size={18} /> +1 Sin Serial
                </button>
                <button 
                  onClick={setManualQuantity}
                  style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#93c5fd', border: '1px solid rgba(147, 197, 253, 0.3)', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 'bold' }}>
                  Ingresar Cantidad
                </button>
              </div>
            </div>

            {/* Lista de Seriales del SKU Activo */}
            {activeItem.serials.length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '0.5rem', marginBottom: '1rem', maxHeight: '150px', overflowY: 'auto' }}>
                <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Últimos seriales escaneados:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Mostramos los últimos agregados primero */}
                  {[...activeItem.serials].reverse().map(serial => (
                    <div key={serial} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '0.25rem' }}>
                      <span style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>{serial}</span>
                      <button 
                        onClick={() => removeSerial(activeItem.id, serial)}
                        className="btn-icon" 
                        style={{ padding: '0.25rem', color: 'var(--danger)' }}
                        title="Borrar este serial"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
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

      <section className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="list-header" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <ListChecks size={20} /> Resumen
          </h2>
          {items.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={clearInventory}
                style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
                <Trash2 size={18} /> Nueva Toma
              </button>
              <button 
                onClick={exportToExcel}
                style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
                <Download size={18} /> Excel
              </button>
            </div>
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
              <div 
                key={item.id} 
                className="item-card" 
                style={{ 
                  borderLeft: activeItem?.id === item.id ? '4px solid var(--accent)' : 'none',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  if (!activeItem || activeItem.id !== item.id) {
                    setActiveItem(item);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
              >
                <div className="item-details">
                  <span className="item-code" style={{ fontSize: '1.1rem' }}>SKU: {item.code}</span>
                  {item.name && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{item.name}</div>}
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
                  <button onClick={(e) => { e.stopPropagation(); removeItem(item.id); }} className="btn-icon" aria-label="Eliminar">
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
