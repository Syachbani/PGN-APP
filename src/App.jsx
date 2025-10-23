import React, { useState, useEffect } from 'react';

const App = () => {
  // State for application files and data
  const [excelFile, setExcelFile] = useState(null);
  const [docFiles, setDocFiles] = useState([]);
  const [detectedData, setDetectedData] = useState([]);
  const [columnHeaders, setColumnHeaders] = useState([]);

  // State for UI
  const [statusMessage, setStatusMessage] = useState("Aplikasi siap. Silakan unggah template Excel.");
  const [isLoading, setIsLoading] = useState(false);
  const [docDownloadError, setDocDownloadError] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null); // State for the real-time document viewer

  // Constants for the API
  const API_KEY = "AIzaSyCjnrLDL54gHWD2f5bq-5Jk5E_hF3PW-Ws";
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;

  // Function to load external scripts
  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Utility function to convert file to base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Process document using Gemini API
  const processDocument = async (file) => {
    try {
      const base64File = await fileToBase64(file);
      const mimeType = file.type;

      const prompt = `
        Identifikasi dan berikan data berikut dari dokumen ini:
        Nama, NIK (Nomor Induk Kependudukan), IDPEL (ID Pelanggan), Alamat lengkap, Kelurahan, Kecamatan, RT, RW, Alamat Email, dan Nomor HP/WA.

        Sangat penting untuk memastikan data yang diekstrak akurat dan bebas typo. Lakukan validasi silang pada setiap data yang ditemukan.

        - Untuk NIK, pastikan terdiri dari 16 digit.
        - Untuk email, pastikan memiliki format email yang valid (contoh: user@domain.com).
        - Untuk Nomor HP/WA, pastikan diawali dengan kode negara (+62) atau format umum di Indonesia (contoh: 08xx) dan hanya berisi digit.

        Jika data ditemukan, berikan dalam format JSON. Jika tidak, isi dengan "Tidak Ditemukan".

        JSON Schema:
        {"nama": "...", "nik": "...", "idpel": "...", "alamat": "...", "kelurahan": "...", "kecamatan": "...", "rt": "...", "rw": "...", "email": "...", "no_hp": "..."}
      `;

      const payload = {
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType, data: base64File } }
            ]
          }
        ]
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      const generatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (generatedText) {
        try {
          const cleanedText = generatedText.replace(/^```json\s*|```\s*$/g, '').trim();
          return JSON.parse(cleanedText);
        } catch (e) {
          console.error("Gagal mengurai respons JSON:", e);
          return null;
        }
      } else {
        return null;
      }
    } catch (error) {
      console.error("Kesalahan saat memproses dokumen:", error);
      return null;
    }
  };

  // Handle Excel file upload and read headers
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setExcelFile(file);
      setStatusMessage("Template Excel berhasil diunggah. Membaca header...");
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
        const reader = new FileReader();
        reader.onload = (event) => {
          const data = event.target.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (json.length > 0) {
            setColumnHeaders(json[0]);
            setStatusMessage("Header Excel berhasil dibaca. Unggah dokumen untuk diproses.");
          } else {
            setColumnHeaders([]);
            setStatusMessage("File Excel kosong. Unggah file yang berisi data.");
          }
        };
        reader.readAsBinaryString(file);
      } catch (error) {
        setStatusMessage("Gagal membaca file Excel. Pastikan formatnya benar.");
        console.error("Error reading Excel file:", error);
      }
    } else {
      setExcelFile(null);
      setColumnHeaders([]);
      setStatusMessage("Aplikasi siap. Silakan unggah template Excel.");
    }
  };

  // Handle multi-document upload and instant processing
  const handleDocUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setIsLoading(true);
      setStatusMessage(`Memproses ${files.length} dokumen secara otomatis...`);
      setDocDownloadError(null);
      setDetectedData([]);
      
      const newDocFiles = [];
      const newDetectedData = [];
      const usedNames = new Map(); // Use a map to track and count duplicate names

      for (const file of files) {
        const fileType = file.type;
        const availableFormats = ['original'];
        if (fileType.startsWith('image/')) {
          availableFormats.push('pdf');
        } else if (fileType === 'application/pdf') {
          availableFormats.push('jpg');
        }

        const data = await processDocument(file);
        newDetectedData.push(data);
        
        let detectedName = data?.nama;
        let baseName;
        
        if (detectedName && detectedName !== 'Tidak Ditemukan') {
          baseName = detectedName.replace(/[^a-z0-9\s]/gi, '').trim();
        } else {
          baseName = file.name.split('.').slice(0, -1).join('.');
        }

        // Check for duplicate names and append a number
        let finalName = baseName;
        if (usedNames.has(baseName)) {
            const count = usedNames.get(baseName);
            finalName = `${baseName} (${count})`;
            usedNames.set(baseName, count + 1);
        } else {
            usedNames.set(baseName, 1);
        }

        const extension = availableFormats[0] === 'original' ? file.name.split('.').pop() : availableFormats[0];
        
        newDocFiles.push({
          file: file,
          selected: false,
          format: 'original',
          downloadName: `${finalName}.${extension}`,
          availableFormats: availableFormats,
          fileUrl: URL.createObjectURL(file) // Create URL for viewer
        });
      }

      setDocFiles(newDocFiles);
      setDetectedData(newDetectedData);
      setIsLoading(false);
      setStatusMessage(`${files.length} dokumen berhasil diproses! Data siap untuk mengisi Excel.`);
    } else {
      setDocFiles([]);
      setDetectedData([]);
      setStatusMessage("Aplikasi siap. Silakan unggah template Excel.");
      setDocDownloadError(null);
    }
  };

  // Change the `selected` status of a file
  const handleFileSelect = (index) => {
    const newDocFiles = [...docFiles];
    newDocFiles[index].selected = !newDocFiles[index].selected;
    setDocFiles(newDocFiles);
  };

  // Change the download format for a specific file
  const handleFormatChange = (index, format) => {
    const newDocFiles = [...docFiles];
    newDocFiles[index].format = format;
    
    // Update the download name based on the selected format
    const baseName = newDocFiles[index].downloadName.split('.').slice(0, -1).join('.');
    const extension = format === 'original' ? newDocFiles[index].file.name.split('.').pop() : format;
    newDocFiles[index].downloadName = `${baseName}.${extension}`;
    setDocFiles(newDocFiles);
  };
  
  // Handle filled-in Excel file download
  const handleExcelDownload = async () => {
    if (detectedData.length === 0 || !excelFile) {
      setStatusMessage("Data belum lengkap. Silakan proses dokumen terlebih dahulu.");
      return;
    }

    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        let existingData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (existingData.length === 0) {
          existingData.push(columnHeaders);
        }

        // Consolidation logic: create a map to store unique data
        const consolidatedData = {};
        detectedData.forEach(singleData => {
          const key = JSON.stringify({
            nama: singleData.nama,
            nik: singleData.nik,
            idpel: singleData.idpel,
            email: singleData.email,
            no_hp: singleData.no_hp
          });
          if (!consolidatedData[key]) {
            consolidatedData[key] = singleData;
          }
        });

        Object.values(consolidatedData).forEach(singleData => {
          const newRow = new Array(columnHeaders.length).fill('');
          let keteranganValue = '';

          const isNikFound = singleData.nik && singleData.nik !== 'Tidak Ditemukan';
          const isIdpelFound = singleData.idpel && singleData.idpel !== 'Tidak Ditemukan';
          
          if (!isNikFound && !isIdpelFound) {
            keteranganValue = 'NO KTP & RL';
          } else if (!isNikFound) {
            keteranganValue = 'NO KTP';
          } else if (!isIdpelFound) {
            keteranganValue = 'NO RL';
          }

          columnHeaders.forEach((header, index) => {
            const lowerHeader = header.toLowerCase().replace(/[\s_]/g, '');

            // Aturan untuk mengisi kolom KETERANGAN
            if (lowerHeader.includes('keterangan')) {
              newRow[index] = keteranganValue;
              return;
            }
            
            // Kolom R (indeks 17) dan T (indeks 19) harus kosong
            if (index === 17 || index === 19) {
              newRow[index] = '';
              return;
            }

            if (lowerHeader.includes('nama')) {
              newRow[index] = singleData.nama;
            } else if (lowerHeader.includes('nomorkartuidentitas') || lowerHeader.includes('nik')) {
              newRow[index] = singleData.nik;
            } else if (lowerHeader.includes('idpelangganpln') || lowerHeader.includes('idpel')) {
              newRow[index] = singleData.idpel;
            } else if (lowerHeader.includes('alamat')) {
              newRow[index] = singleData.alamat;
            } else if (lowerHeader.includes('kelurahan')) {
              newRow[index] = singleData.kelurahan;
            } else if (lowerHeader.includes('kecamatan')) {
              newRow[index] = singleData.kecamatan;
            } else if (lowerHeader === 'rt') {
              newRow[index] = singleData.rt;
            } else if (lowerHeader === 'rw') {
              newRow[index] = singleData.rw;
            } else if (lowerHeader.includes('email') || lowerHeader.includes('surel')) {
              newRow[index] = singleData.email;
            } else if (lowerHeader.includes('nomerponsel') || lowerHeader.includes('nohp') || lowerHeader.includes('hp') || lowerHeader.includes('ponsel') || lowerHeader.includes('wa') || lowerHeader.includes('whatsapp')) {
              newRow[index] = singleData.no_hp;
            }
          });
          existingData.push(newRow);
        });

        const newWorksheet = XLSX.utils.aoa_to_sheet(existingData);
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, firstSheetName);

        const fileName = `Dokumen_Terisi.xlsx`;
        XLSX.writeFile(newWorkbook, fileName);
        setStatusMessage("File Excel berhasil diunduh.");
      };
      reader.readAsBinaryString(excelFile);
    } catch (error) {
      console.error("Gagal mengunduh Excel:", error);
      setStatusMessage("Terjadi kesalahan saat mengunduh Excel. Coba lagi.");
    }
  };
  
  // Function to convert and download documents
  const handleDocDownload = async () => {
    const selectedFiles = docFiles.filter(f => f.selected);
    if (selectedFiles.length === 0) {
      setDocDownloadError("Pilih dokumen yang ingin diunduh.");
      return;
    }

    setIsConverting(true);
    setDocDownloadError(null);

    try {
      if (selectedFiles.length === 1) {
        const fileObj = selectedFiles[0];
        let blob = null;
        if (fileObj.format === 'original') {
          blob = fileObj.file;
        } else if (fileObj.format === 'pdf') {
          blob = await imageToPdfBlob(fileObj.file);
        } else if (fileObj.format === 'jpg') {
          blob = await pdfToJpgBlob(fileObj.file);
        }
        if (blob) {
          downloadBlob(blob, fileObj.downloadName);
        }
        setStatusMessage("Dokumen berhasil diunduh.");
      } else {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js');

        const zip = new JSZip();

        for (const fileObj of selectedFiles) {
          let blob = null;
          if (fileObj.format === 'original') {
            blob = fileObj.file;
          } else if (fileObj.format === 'pdf') {
            blob = await imageToPdfBlob(fileObj.file);
          } else if (fileObj.format === 'jpg') {
            blob = await pdfToJpgBlob(fileObj.file);
          }

          if (blob) {
            zip.file(fileObj.downloadName, blob);
          }
        }

        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "Dokumen_Terunduh.zip");
        setStatusMessage("Dokumen berhasil diunduh dalam format ZIP.");
      }
    } catch (error) {
      console.error("Gagal mengunduh/mengonversi dokumen:", error);
      setDocDownloadError("Terjadi kesalahan saat mengunduh/mengonversi dokumen. Coba unggah ulang.");
    } finally {
      setIsConverting(false);
    }
  };
  
  // Function to download a Blob
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  // Helper: Convert image to PDF Blob
  const imageToPdfBlob = async (file) => {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const originalWidth = img.width;
          const originalHeight = img.height;

          const pdf = new jsPDF({
            orientation: originalWidth > originalHeight ? 'l' : 'p',
            unit: 'px',
            format: [originalWidth, originalHeight]
          });
          pdf.addImage(img, 'JPEG', 0, 0, originalWidth, originalHeight);
          resolve(pdf.output('blob'));
        };
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Helper: Convert PDF to JPG Blob
  const pdfToJpgBlob = async (file) => {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js');
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = async () => {
        try {
          const pdfData = new Uint8Array(fileReader.result);
          const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport: viewport }).promise;
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/jpeg');
        } catch (error) {
          reject(error);
        }
      };
      fileReader.onerror = reject;
      fileReader.readAsArrayBuffer(file);
    });
  };
  
  const selectedCount = docFiles.filter(f => f.selected).length;

  // Lucide icons loaded via script tags
  const FileSpreadsheetIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-spreadsheet text-green-400 mb-3"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L15 2z"/><path d="M14 2v6h6"/><path d="M8 13h12"/><path d="M8 17h12"/><path d="M8 9h12"/></svg>
  );

  const FileTextIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text text-yellow-400 mb-3"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L15 2z"/><path d="M14 2v6h6"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
  );

  const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
  );

  const SpinnerIcon = () => (
    <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
  
  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-eye"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
  );
  
  const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6L6 18M6 6L18 18"/></svg>
  );

  return (
    <div className="bg-gray-900 text-white min-h-screen p-8 flex flex-col items-center">
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://unpkg.com/lucide@latest"></script>
      <div className="container mx-auto p-6 bg-gray-800 rounded-3xl shadow-lg max-w-2xl">
        <h1 className="text-4xl font-bold text-center mb-6 text-green-400">Otomasi Berkas ke Excel</h1>
        <p className="text-center text-gray-400 mb-8">
          Unggah template Excel dan dokumen formulir untuk mengisi data secara otomatis.
        </p>

        <div className="space-y-6">
          {/* Bagian Unggah Template Excel */}
          <div className="p-5 bg-gray-700 rounded-2xl border-2 border-dashed border-gray-600">
            <label htmlFor="excel-upload" className="cursor-pointer">
              <div className="flex flex-col items-center justify-center">
                <FileSpreadsheetIcon />
                <span className="text-xl font-semibold text-gray-200">Unggah Template Excel</span>
                <span className="text-sm text-gray-400 mt-1">Klik untuk memilih file .xlsx</span>
              </div>
            </label>
            <input id="excel-upload" type="file" className="hidden" accept=".xlsx, .xls" onChange={handleExcelUpload} />
            {excelFile && <p className="mt-4 text-center text-sm text-gray-300">Template: {excelFile.name}</p>}
            {columnHeaders.length > 0 && (
              <div className="mt-4 text-center">
                <span className="text-gray-400">Kolom Ditemukan: </span>
                <span className="text-sm text-gray-300">{columnHeaders.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Bagian Unggah Dokumen */}
          <div className="p-5 bg-gray-700 rounded-2xl border-2 border-dashed border-gray-600">
            <label htmlFor="doc-upload" className="cursor-pointer">
              <div className="flex flex-col items-center justify-center">
                <FileTextIcon />
                <span className="text-xl font-semibold text-gray-200">Unggah Dokumen Formulir (Bisa Unggah Banyak)</span>
                <span className="text-sm text-gray-400 mt-1">Klik untuk memilih KTP/Formulir</span>
              </div>
            </label>
            <input id="doc-upload" type="file" className="hidden" accept="image/*, .pdf" onChange={handleDocUpload} multiple />
            {docFiles.length > 0 && (
              <p className="mt-4 text-center text-sm text-gray-300">
                {docFiles.length} Dokumen Diunggah.
              </p>
            )}
          </div>
        </div>

        {/* Tombol Aksi */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
          <button
            onClick={() => handleExcelDownload()}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-full font-semibold shadow-lg hover:bg-blue-700 disabled:bg-gray-500 transition-all w-full sm:w-auto justify-center"
            disabled={detectedData.length === 0}
          >
            <DownloadIcon />
            <span>Isi Excel & Unduh</span>
          </button>
        </div>

        {/* Area Status & Hasil */}
        <div className="mt-8 p-6 bg-gray-700 rounded-2xl">
          <p className="text-lg font-semibold text-gray-200 mb-2">Status:</p>
          <p className="text-md text-gray-400 flex items-center">{isLoading && <span className="h-5 w-5 text-blue-400 mr-2"><SpinnerIcon /></span>}{statusMessage}</p>
          {detectedData.length > 0 && (
            <div className="mt-6 border-t border-gray-600 pt-6">
              <h2 className="text-xl font-bold text-gray-200 mb-4">Data yang Terdeteksi:</h2>
              {detectedData.map((data, index) => (
                <div key={index} className="p-4 mb-4 bg-gray-600 rounded-xl">
                  <h3 className="text-lg font-semibold text-white mb-2">Dokumen #{index + 1}</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">Nama:</span> <span className="truncate">{data?.nama || 'Tidak Ditemukan'}</span></li>
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">NIK:</span> <span className="truncate">{data?.nik || 'Tidak Ditemukan'}</span></li>
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">IDPEL:</span> <span className="truncate">{data?.idpel || 'Tidak Ditemukan'}</span></li>
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">Alamat:</span> <span className="truncate">{data?.alamat || 'Tidak Ditemukan'}</span></li>
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">Kelurahan:</span> <span className="truncate">{data?.kelurahan || 'Tidak Ditemukan'}</span></li>
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">Kecamatan:</span> <span className="truncate">{data?.kecamatan || 'Tidak Ditemukan'}</span></li>
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">RT:</span> <span className="truncate">{data?.rt || 'Tidak Ditemukan'}</span></li>
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">RW:</span> <span className="truncate">{data?.rw || 'Tidak Ditemukan'}</span></li>
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">Email:</span> <span className="truncate">{data?.email || 'Tidak Ditemukan'}</span></li>
                    <li className="flex items-center space-x-2"><span className="font-semibold text-white">No. HP/WA:</span> <span className="truncate">{data?.no_hp || 'Tidak Ditemukan'}</span></li>
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bagian Unduh Dokumen */}
        <div className="mt-8 p-6 bg-gray-700 rounded-2xl">
          <h3 className="text-xl font-bold text-white mb-4">Unduh & Lihat Dokumen Asli</h3>
          <p className="text-sm text-gray-400 mb-4">
            Pilih dokumen, format unduhan, dan lihat pratinjau.
          </p>
          {docFiles.length > 0 ? (
            <ul className="space-y-4">
              {docFiles.map((doc, index) => (
                <li key={index} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-gray-600 rounded-xl space-y-2 sm:space-y-0">
                  <div className="flex items-center space-x-3 w-full sm:w-auto">
                    <input
                      type="checkbox"
                      checked={doc.selected}
                      onChange={() => handleFileSelect(index)}
                      className="form-checkbox h-5 w-5 text-purple-400 rounded-md bg-gray-800 border-gray-500 focus:ring-purple-400"
                    />
                    <span className="text-gray-200 font-medium truncate max-w-[150px] sm:max-w-none">{doc.file.name}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
                    <button
                      onClick={() => setViewingDoc(doc)}
                      className="flex items-center space-x-1 px-3 py-2 bg-gray-800 text-gray-300 rounded-full hover:bg-gray-700 transition-all"
                    >
                      <EyeIcon />
                      <span>Lihat</span>
                    </button>
                    <select
                      value={doc.format}
                      onChange={(e) => handleFormatChange(index, e.target.value)}
                      disabled={!doc.selected}
                      className="px-4 py-2 bg-gray-800 text-white rounded-full border border-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400 w-full"
                    >
                      {doc.availableFormats.map(format => (
                        <option key={format} value={format}>{format.toUpperCase()}</option>
                      ))}
                    </select>
                    <span className="text-sm text-gray-400">Nama file unduhan: <span className="font-semibold text-gray-200">{doc.downloadName}</span></span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-center">Tidak ada dokumen yang diunggah.</p>
          )}
          {docDownloadError && <p className="mt-4 text-sm text-red-400">{docDownloadError}</p>}
          <div className="mt-6">
            <button
              onClick={handleDocDownload}
              className="flex items-center justify-center space-x-2 px-6 py-3 bg-purple-600 text-white rounded-full font-semibold shadow-lg hover:bg-purple-700 disabled:bg-gray-500 transition-all w-full"
              disabled={selectedCount === 0 || isConverting}
            >
              {isConverting && <span className="h-5 w-5 text-white"><SpinnerIcon /></span>}
              <span>{selectedCount > 1 ? "Unduh sebagai ZIP" : "Unduh Dokumen"}</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Real-time Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="relative bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-600">
              <h2 className="text-xl font-bold text-white truncate">{viewingDoc.file.name}</h2>
              <button onClick={() => setViewingDoc(null)} className="text-gray-400 hover:text-white transition-colors">
                <CloseIcon />
              </button>
            </div>
            <div className="flex-grow overflow-auto p-4 flex items-center justify-center">
              {viewingDoc.file.type.startsWith('image/') ? (
                <img src={viewingDoc.fileUrl} alt="Document Preview" className="max-w-full max-h-full rounded-xl" />
              ) : viewingDoc.file.type === 'application/pdf' ? (
                <iframe src={viewingDoc.fileUrl} title="PDF Document" className="w-full h-full border-0"></iframe>
              ) : (
                <p className="text-white text-center">Format file tidak didukung untuk pratinjau.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
