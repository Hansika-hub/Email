# Event Email Extraction (EEE) — Frontend Client

A responsive, visually premium web dashboard that serves as the user interface for the **Event Email Extraction (EEE) - Event Reminder** application. 

This client communicates with Google's authentication systems, pulls event-related emails, displays processed events extracted from those emails, schedules push notifications, and allows users to manually manage custom reminders.

---

## 🚀 Key Features

*   **Google Auth Integration**: Employs the modern **Google Identity Services (GSI)** SDK to authorize Gmail read scopes (`gmail.readonly`) securely.
*   **Collapsible Sidebar Drawer**: Houses quick status filters (Upcoming, Attended, Missed counts) and Google login/logout configurations.
*   **Events Grid & Search**: Displays extraction results (Event name, date, time, venue) with support for real-time text-based search.
*   **Custom Reminders**: A modal interface that lets users manually insert custom events (with offline scheduling).
*   **Local Notifications**: Requests browser notifications permissions and schedules automatic desktop alerts 60, 15, and 5 minutes prior to scheduled event times.
*   **Responsive Styling**: Engineered using modern Vanilla CSS with a responsive layout, purple/lavender gradient design, micro-animations, and fluid state changes.

---

## 🛠️ Technology Stack

*   **Markup**: HTML5 (Semantic tags, Modal dialogs)
*   **Styling**: Custom CSS (CSS grid/flexbox, transitions, custom gradients, mobile responsiveness)
*   **Logic**: Pure Vanilla ES6 JavaScript (Google API SDKs, LocalStorage cache layer, Notification APIs)
*   **Hosting Configuration**: Vercel configuration (`vercel.json`)

---

## 📦 File Structure

*   `index.html` — Main layout containing sidebars, grid systems, and custom event modals.
*   `policy.html` — Privacy policy highlighting permissions requested (`gmail.readonly` and `userinfo.email`).
*   `Proemail.css` — Core style design system with typography, gradients, animations, and layouts.
*   `Proemail.js` — Core application script coordinating Auth callbacks, event fetching, localStorage caching, custom validations, and browser notifications.
*   `vercel.json` — Vercel config. Sets strict Content-Security-Policy (CSP) headers and rewrites `/api/*` requests to the external backend service to bypass CORS restrictions.

---

## 💻 Local Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/Hansika-hub/Email.git
    cd Email
    ```

2.  **Run a Static Server**:
    Since this is a client-only static project, you can host it locally using standard utilities:
    *   **Using Python**:
        ```bash
        python3 -m http.server 3000
        ```
    *   **Using Node/npx**:
        ```bash
        npx serve -l 3000
        ```

3.  **Access the Dashboard**:
    Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 🌐 Deployment

This application is ready to deploy on **Vercel**:
*   The `vercel.json` file is configured out-of-the-box.
*   It routes API endpoints via rewrites to the deployed backend on Render: `https://email-backend-bu9l.onrender.com`.
*   To deploy, run:
    ```bash
    npm install -g vercel
    vercel
    ```
