# 🏥 HealthVault - Personal Health Record Tracker

A comprehensive, accessible web application designed to help users manage their medical data, track vitals, and maintain personal health records securely. Built with a robust backend architecture, this project features a seamless fallback **Mock Mode** to ensure uninterrupted development and demonstration even without a live database.

---

## 🚀 Features

### 🔐 Secure Authentication
- User login and registration with token-based authorization.

### 📊 Health Dashboard
- Real-time overview of vitals including:
  - BPM (Heart Rate)
  - Blood Pressure
  - BMI
  - Weight

### 📁 Record Management
- Add, view, and organize various health records:
  - Allergies
  - Vitals
  - Treatments
  - Vaccinations
  - Appointments

### ♿ Accessibility First
- Built-in toggles for:
  - High Contrast Mode
  - Large Text
  - Large Buttons

### 🔒 Access Control
- Mockups for managing:
  - Data privacy
  - Sharing with healthcare providers or emergency contacts

### ⚡ Smart Fallback Mode
- Automatically switches to **Mock Mode** if MongoDB is unavailable
- Ensures UI remains fully functional for testing and demos

---

## 🛠️ Tech Stack

### 🎨 Frontend
- HTML5 & CSS3  
- Vanilla JavaScript (ES6+)  
- Bootstrap 5.3 (Responsive UI)  
- FontAwesome (Icons)  

### ⚙️ Backend
- Node.js  
- Express.js  
- MongoDB & Mongoose  
- CORS & Body-Parser  

---

## ⚙️ Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v14 or higher)
- MongoDB (Local installation or MongoDB Atlas)

---

## 📦 Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/HealthVault.git
cd HealthVault
