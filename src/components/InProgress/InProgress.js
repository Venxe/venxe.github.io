// src/components/InProgress/InProgress.js
import React from 'react';
import './InProgress.css';

const InProgress = () => (
  <div className="in-progress">
    <div className="in-progress__content">
      <h1 className="in-progress__title">Site Under Construction</h1>
      <p className="in-progress__subtitle">Launching Soon…</p>
      <div className="in-progress__spinner" aria-label="loading" />
    </div>
  </div>
);

export default InProgress;
