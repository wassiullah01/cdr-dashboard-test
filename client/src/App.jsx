import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Link } from 'react-router-dom';
import Header from './components/Header';
import UploadSection from './components/UploadSection';
import Dashboard from './components/Dashboard';
import Network from './components/Network';
import Alerts from './components/Alerts';
import { apiUrl } from './utils/api';
import './styles/dashboard.css';

function App() {
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [currentUploadId, setCurrentUploadId] = useState(null);
  const [viewMode, setViewMode] = useState('current'); // 'current' | 'all'
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine active view from URL
  const activeView = location.pathname === '/network' ? 'network' : 
                     location.pathname === '/alerts' ? 'alerts' : 'dashboard';

  // Verify saved uploadId exists in database on mount
  useEffect(() => {
    const savedUploadId = localStorage.getItem('currentUploadId');
    if (savedUploadId) {
      // Verify the uploadId actually has data in the database
      // If database was cleared, this will fail and we'll show upload page
      fetch(apiUrl(`/api/analytics/overview?uploadId=${savedUploadId}`))
        .then(res => res.json())
        .then(data => {
          // If we get data back and totalEvents > 0, the uploadId is valid
          if (data.totalEvents !== undefined && data.totalEvents > 0) {
            setCurrentUploadId(savedUploadId);
            setUploadComplete(true);
            // Optionally fetch summary for display
            setUploadSummary({
              totalInserted: data.totalEvents,
              totalFiles: 1, // We don't know exact count, but at least 1
              totalSkipped: 0
            });
          } else {
            // UploadId exists but has no data, or database was cleared
            localStorage.removeItem('currentUploadId');
            setCurrentUploadId(null);
            setUploadComplete(false);
          }
        })
        .catch(error => {
          // API error or uploadId doesn't exist - clear localStorage and show upload page
          console.warn('Saved uploadId is invalid, showing upload page:', error);
          localStorage.removeItem('currentUploadId');
          setCurrentUploadId(null);
          setUploadComplete(false);
        });
    }
    // If no savedUploadId, uploadComplete stays false (shows upload page)
  }, []);

  const handleUploadComplete = (data) => {
    // Extract uploadId from response (new field name)
    const uploadId = data.uploadId || data.uploadSessionId || data.summary?.uploadId;
    if (uploadId) {
      setCurrentUploadId(uploadId);
      localStorage.setItem('currentUploadId', uploadId);
    }
    setUploadSummary(data.summary || data);
    setViewMode('current'); // Always switch to current view after new upload
    setUploadComplete(true);
  };

  const handleNewUpload = () => {
    setUploadComplete(false);
    setUploadSummary(null);
    navigate('/');
    // Don't clear currentUploadId - keep it for reference
    // setCurrentUploadId(null);
    // localStorage.removeItem('currentUploadId');
  };

  const handleViewChange = (view) => {
    if (view === 'network') {
      navigate('/network');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="app">
      <Header />
      <Routes>
        <Route 
          path="/" 
          element={
            !uploadComplete ? (
              <UploadSection onUploadComplete={handleUploadComplete} />
            ) : (
              <>
                {/* Navigation Tabs */}
                <div className="view-navigation">
                  <div className="container">
                    <Link
                      to="/"
                      className={`nav-tab ${activeView === 'dashboard' ? 'active' : ''}`}
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/network"
                      className={`nav-tab ${activeView === 'network' ? 'active' : ''}`}
                    >
                      Network
                    </Link>
                    <Link
                      to="/alerts"
                      className={`nav-tab ${activeView === 'alerts' ? 'active' : ''}`}
                    >
                      Alerts
                    </Link>
                  </div>
                </div>

                <Dashboard 
                  uploadSummary={uploadSummary}
                  currentUploadId={currentUploadId}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  onNewUpload={handleNewUpload}
                />
              </>
            )
          } 
        />
        <Route 
          path="/network" 
          element={
            !uploadComplete ? (
              <UploadSection onUploadComplete={handleUploadComplete} />
            ) : (
              <>
                {/* Navigation Tabs */}
                <div className="view-navigation">
                  <div className="container">
                    <Link
                      to="/"
                      className={`nav-tab ${activeView === 'dashboard' ? 'active' : ''}`}
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/network"
                      className={`nav-tab ${activeView === 'network' ? 'active' : ''}`}
                    >
                      Network
                    </Link>
                    <Link
                      to="/alerts"
                      className={`nav-tab ${activeView === 'alerts' ? 'active' : ''}`}
                    >
                      Alerts
                    </Link>
                  </div>
                </div>

                <Network 
                  currentUploadId={currentUploadId}
                  viewMode={viewMode}
                />
              </>
            )
          } 
        />
        <Route 
          path="/alerts" 
          element={
            !uploadComplete ? (
              <UploadSection onUploadComplete={handleUploadComplete} />
            ) : (
              <>
                {/* Navigation Tabs */}
                <div className="view-navigation">
                  <div className="container">
                    <Link
                      to="/"
                      className={`nav-tab ${activeView === 'dashboard' ? 'active' : ''}`}
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/network"
                      className={`nav-tab ${activeView === 'network' ? 'active' : ''}`}
                    >
                      Network
                    </Link>
                    <Link
                      to="/alerts"
                      className={`nav-tab ${activeView === 'alerts' ? 'active' : ''}`}
                    >
                      Alerts
                    </Link>
                  </div>
                </div>

                <Alerts 
                  currentUploadId={currentUploadId}
                  viewMode={viewMode}
                />
              </>
            )
          } 
        />
      </Routes>
    </div>
  );
}

export default App;
