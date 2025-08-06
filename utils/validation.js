// GDPR compliant data validation utilities

const appointmentConfig = require('../config/appointments');

class DataValidator {
  
  // Validate Slovak birth number (rodné číslo)
  static validateBirthNumber(birthNumber) {
    if (!birthNumber || typeof birthNumber !== 'string') {
      return { valid: false, error: 'Rodné číslo je povinné' };
    }
    
    // Remove any slashes or spaces
    const cleaned = birthNumber.replace(/[\/\s]/g, '');
    
    // Check length (should be 10 or 11 digits)
    if (!/^\d{10,11}$/.test(cleaned)) {
      return { valid: false, error: 'Rodné číslo musí obsahovať 10 alebo 11 číslic' };
    }
    
    // Basic format validation for Slovak birth numbers
    if (cleaned.length === 10) {
      // Older format (before 1954)
      return { valid: true };
    }
    
    if (cleaned.length === 11) {
      // Modern format with check digit
      const checksum = this.calculateBirthNumberChecksum(cleaned.substring(0, 10));
      const checkDigit = parseInt(cleaned.substring(10, 11));
      
      if (checksum !== checkDigit) {
        return { valid: false, error: 'Neplatné rodné číslo (chybná kontrolná číslica)' };
      }
    }
    
    return { valid: true };
  }
  
  static calculateBirthNumberChecksum(birthNumber) {
    const num = parseInt(birthNumber);
    return num % 11 === 10 ? 0 : num % 11;
  }
  
  // Validate Slovak phone number
  static validatePhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return { valid: false, error: 'Telefónne číslo je povinné' };
    }
    
    // Remove spaces, dashes, and parentheses
    const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    // Slovak phone number patterns
    const patterns = [
      /^\+421\d{9}$/,           // +421 xxx xxx xxx
      /^00421\d{9}$/,           // 00421 xxx xxx xxx  
      /^0\d{9}$/,               // 0xxx xxx xxx (domestic)
      /^9\d{8}$/                // 9xx xxx xxx (mobile without 0)
    ];
    
    const isValid = patterns.some(pattern => pattern.test(cleaned));
    
    if (!isValid) {
      return { valid: false, error: 'Neplatné telefónne číslo' };
    }
    
    return { valid: true, normalized: this.normalizePhoneNumber(cleaned) };
  }
  
  static normalizePhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    // Convert to international format +421 XXXXXXXXX
    let normalized = '';
    
    if (cleaned.startsWith('00421')) {
      normalized = '+' + cleaned.substring(2);
    } else if (cleaned.startsWith('0')) {
      normalized = '+421' + cleaned.substring(1);
    } else if (cleaned.startsWith('9') && cleaned.length === 9) {
      normalized = '+421' + cleaned;
    } else if (cleaned.startsWith('+421')) {
      normalized = cleaned;
    } else {
      return phoneNumber; // Return original if can't normalize
    }
    
    // Format as +421 XXXXXXXXX (space after country code)
    if (normalized.startsWith('+421') && normalized.length === 13) {
      return `+421 ${normalized.substring(4)}`;
    }
    
    return normalized;
  }
  
  // Validate email address
  static validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return { valid: true }; // Email is optional
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email.trim());
    
    if (!isValid) {
      return { valid: false, error: 'Neplatná emailová adresa' };
    }
    
    return { valid: true, normalized: email.toLowerCase().trim() };
  }
  
  // Validate patient name
  static validateName(name, fieldName) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: `${fieldName} je povinné` };
    }
    
    const trimmed = name.trim();
    
    if (trimmed.length < 2) {
      return { valid: false, error: `${fieldName} musí mať aspoň 2 znaky` };
    }
    
    if (trimmed.length > 50) {
      return { valid: false, error: `${fieldName} môže mať maximálne 50 znakov` };
    }
    
    // Only letters, spaces, hyphens, and Slovak characters
    const nameRegex = /^[a-zA-ZáäčďéíĺľňóôšťúýžÁÄČĎÉÍĹĽŇÓÔŠŤÚÝŽ\s\-']+$/;
    
    if (!nameRegex.test(trimmed)) {
      return { valid: false, error: `${fieldName} môže obsahovať iba písmená, medzery a pomlčky` };
    }
    
    return { valid: true, normalized: this.capitalizeWords(trimmed) };
  }
  
  static capitalizeWords(str) {
    return str.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // Validate health insurance company
  static validateHealthInsurance(insurance) {
    if (!insurance || typeof insurance !== 'string') {
      return { valid: false, error: 'Zdravotná poisťovňa je povinná' };
    }
    
    const validInsurers = [
      'VšZP', 'Všeobecná zdravotná poisťovňa',
      'Dôvera', 'Dôvera zdravotná poisťovňa',
      'Union', 'Union zdravotná poisťovňa',
      'KONAS', 'KONAS zdravotná poisťovňa'
    ];
    
    const normalized = insurance.trim();
    const isValid = validInsurers.some(insurer => 
      insurer.toLowerCase().includes(normalized.toLowerCase()) ||
      normalized.toLowerCase().includes(insurer.toLowerCase())
    );
    
    if (!isValid) {
      return { 
        valid: false, 
        error: 'Neplatná zdravotná poisťovňa',
        hint: 'Zadajte: VšZP, Dôvera, Union alebo KONAS'
      };
    }
    
    return { valid: true, normalized };
  }
  
  // Validate appointment type
  static validateAppointmentType(appointmentType) {
    if (!appointmentType || typeof appointmentType !== 'string') {
      return { valid: false, error: 'Typ vyšetrenia je povinný' };
    }
    
    const validTypes = Object.keys(appointmentConfig.appointmentTypes);
    
    if (!validTypes.includes(appointmentType)) {
      return { 
        valid: false, 
        error: 'Neplatný typ vyšetrenia',
        validTypes: validTypes
      };
    }
    
    return { valid: true };
  }
  
  // Validate date format and range
  static validateDate(date) {
    if (!date || typeof date !== 'string') {
      return { valid: false, error: 'Dátum je povinný' };
    }
    
    const dateObj = new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return { valid: false, error: 'Neplatný formát dátumu' };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 3); // Allow booking up to 3 months ahead
    
    if (dateObj < today) {
      return { valid: false, error: 'Nie je možné rezervovať termín v minulosti' };
    }
    
    if (dateObj > maxDate) {
      return { valid: false, error: 'Nie je možné rezervovať termín viac ako 3 mesiace vopred' };
    }
    
    return { valid: true };
  }
  
  // Validate time format
  static validateTime(time) {
    if (!time || typeof time !== 'string') {
      return { valid: false, error: 'Čas je povinný' };
    }
    
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    
    if (!timeRegex.test(time)) {
      return { valid: false, error: 'Neplatný formát času (použite HH:MM)' };
    }
    
    return { valid: true };
  }
  
  // Comprehensive patient data validation
  static validatePatientData(patientData, appointmentType) {
    const errors = [];
    const normalized = {};
    
    const config = appointmentConfig.appointmentTypes[appointmentType];
    if (!config) {
      errors.push('Neplatný typ vyšetrenia');
      return { valid: false, errors };
    }
    
    // Validate required fields based on appointment type
    for (const field of config.requiredData) {
      switch (field) {
        case 'meno':
          const nameResult = this.validateName(patientData.meno, 'Meno');
          if (!nameResult.valid) {
            errors.push(nameResult.error);
          } else {
            normalized.meno = nameResult.normalized;
          }
          break;
          
        case 'priezvisko':
          const surnameResult = this.validateName(patientData.priezvisko, 'Priezvisko');
          if (!surnameResult.valid) {
            errors.push(surnameResult.error);
          } else {
            normalized.priezvisko = surnameResult.normalized;
          }
          break;
          
        case 'telefon':
          const phoneResult = this.validatePhoneNumber(patientData.telefon);
          if (!phoneResult.valid) {
            errors.push(phoneResult.error);
          } else {
            normalized.telefon = phoneResult.normalized;
          }
          break;
          
        case 'rodne_cislo':
          const birthResult = this.validateBirthNumber(patientData.rodne_cislo);
          if (!birthResult.valid) {
            errors.push(birthResult.error);
          } else {
            normalized.rodne_cislo = patientData.rodne_cislo;
          }
          break;
          
        case 'zdravotna_poistovna':
          const insuranceResult = this.validateHealthInsurance(patientData.zdravotna_poistovna);
          if (!insuranceResult.valid) {
            errors.push(insuranceResult.error);
          } else {
            normalized.zdravotna_poistovna = insuranceResult.normalized;
          }
          break;
          
        case 'email':
          if (patientData.email) {
            const emailResult = this.validateEmail(patientData.email);
            if (!emailResult.valid) {
              errors.push(emailResult.error);
            } else {
              normalized.email = emailResult.normalized;
            }
          }
          break;
          
        case 'prvotne_tazkosti':
          if (patientData.prvotne_tazkosti) {
            const complaints = patientData.prvotne_tazkosti.trim();
            if (complaints.length > 500) {
              errors.push('Popis ťažkostí môže mať maximálne 500 znakov');
            } else {
              normalized.prvotne_tazkosti = complaints;
            }
          }
          break;
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      normalizedData: normalized
    };
  }
  
  // Sanitize data for logging (remove sensitive info)
  static sanitizeForLogging(patientData) {
    const sanitized = { ...patientData };
    
    // Mask sensitive data
    if (sanitized.rodne_cislo) {
      sanitized.rodne_cislo = '*'.repeat(sanitized.rodne_cislo.length);
    }
    
    if (sanitized.telefon) {
      const phone = sanitized.telefon;
      sanitized.telefon = phone.substring(0, 4) + '*'.repeat(phone.length - 4);
    }
    
    return sanitized;
  }
}

module.exports = DataValidator;