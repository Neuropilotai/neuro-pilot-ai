/**
 * LegalFooter Component
 * Displays copyright and ownership information
 * Auto-updates year dynamically
 */

import React from 'react';

const LegalFooter = ({ variant = 'default', className = '' }) => {
  const currentYear = new Date().getFullYear();

  const styles = {
    default: {
      footer: {
        marginTop: 'auto',
        padding: '20px',
        textAlign: 'center',
        borderTop: '1px solid rgba(102, 126, 234, 0.1)',
        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
        fontSize: '13px',
        color: '#4a5568'
      }
    },
    compact: {
      footer: {
        padding: '12px',
        textAlign: 'center',
        borderTop: '1px solid rgba(0, 0, 0, 0.1)',
        fontSize: '11px',
        color: '#718096'
      }
    },
    purple: {
      footer: {
        padding: '20px',
        textAlign: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '12px',
        opacity: 0.9
      }
    }
  };

  const selectedStyle = styles[variant] || styles.default;

  return (
    <footer
      style={selectedStyle.footer}
      className={`legal-footer ${className}`}
    >
      <div style={{ marginBottom: '4px' }}>
        © {currentYear} NeuroInnovate · Proprietary System · Owned and operated by David Mikulis
      </div>
      <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px' }}>
        Unauthorized access or redistribution is prohibited.
      </div>
    </footer>
  );
};

export default LegalFooter;
