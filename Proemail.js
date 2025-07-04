// Sidebar toggle function
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}

// Global variables
let auth2;
let accessToken = null;
const BACKEND_URL = "https://email-backend-bu9l.onrender.com"; // Change to your deployed backend URL

// Initialize Google Auth
function initGoogleAuth() {
  gapi.load('auth2', () => {
    auth2 = gapi.auth2.init({
      client_id: '721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    });

    // Setup login click listener AFTER auth2 is ready
    setupLoginButton();
  });
}

// Setup login button click
function setupLoginButton() {
  const loginButton = document.getElementById('login-button');
  loginButton.addEventListener('click', async () => {
    if (!auth2) {
      alert("Google Auth is still initializing. Try again shortly.");
      return;
    }

    try {
      const googleUser = await auth2.signIn();
      accessToken = googleUser.getAuthResponse().access_token;

      // Update UI
      loginButton.innerHTML = '👤 <span>Logged In</span>';
      loginButton.disabled = true;

      // Send token to backend
      const authResponse = await fetch(`${BACKEND_URL}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });
      if (!authResponse.ok) throw new Error('Auth failed');

      // Fetch emails
      fetchEmails();
    } catch (error) {
      console.error('Login error:', error);
      const errDiv = document.getElementById('email-error');
      errDiv.style.display = 'block';
      errDiv.textContent = 'Failed to sign in. Please try again.';
    }
  });
}

// Fetch emails from backend
async function fetchEmails() {
  const emailList = document.getElementById('email-list');
  const emailLoading = document.getElementById('email-loading');
  const emailError = document.getElementById('email-error');
  emailLoading.style.display = 'block';
  emailError.style.display = 'none';

  try {
    const response = await fetch(`${BACKEND_URL}/fetch_emails`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Fetch emails failed');

    const emails = await response.json();
    emailList.innerHTML = '';

    emails.forEach(email => {
      const emailItem = document.createElement('div');
      emailItem.className = 'email-item';
      emailItem.textContent = email.subject || 'No Subject';
      emailItem.addEventListener('click', () => fetchEvents(email.id));
      emailList.appendChild(emailItem);
    });
  } catch (error) {
    console.error('Fetch emails error:', error);
    emailError.style.display = 'block';
    emailError.textContent = 'Error fetching emails.';
  } finally {
    emailLoading.style.display = 'none';
  }
}

// Fetch events from backend for selected email
async function fetchEvents(emailId) {
  const eventsList = document.getElementById('events-list');
  const eventsLoading = document.getElementById('events-loading');
  const eventsError = document.getElementById('events-error');
  eventsLoading.style.display = 'block';
  eventsError.style.display = 'none';

  try {
    const response = await fetch(`${BACKEND_URL}/process_emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ emailId }),
    });
    if (!response.ok) throw new Error('Event extraction failed');

    const events = await response.json();
    eventsList.innerHTML = '';

    events.forEach(event => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div style="color: #8b5cf6; font-weight: bold;">${event.type || 'Event'}</div>
        <h2>${event.event_name || 'No Title'}</h2>
        <p>📅 ${event.date || 'N/A'}</p>
        <p>⏰ ${event.time || 'N/A'}</p>
        <p>📍 ${event.venue || 'N/A'}</p>
        <p>👥 ${event.attendees || 0} attendees</p>
      `;
      eventsList.appendChild(card);
    });

    updateSummary(events);
  } catch (error) {
    console.error('Fetch events error:', error);
    eventsError.style.display = 'block';
    eventsError.textContent = 'No events found for this email.';
  } finally {
    eventsLoading.style.display = 'none';
  }
}

// Update the event summary section
function updateSummary(events) {
  const totalEvents = events.length;
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const thisWeekEvents = events.filter(event => {
    const eventDate = new Date(event.date);
    return eventDate >= weekStart && eventDate <= weekEnd;
  }).length;

  const totalAttendees = events.reduce((sum, event) => sum + (parseInt(event.attendees) || 0), 0);

  document.getElementById('total-events').textContent = totalEvents;
  document.getElementById('this-week-events').textContent = thisWeekEvents;
  document.getElementById('total-attendees').textContent = totalAttendees;
  document.getElementById('upcoming-count').textContent = totalEvents;
  document.getElementById('attended-count').textContent = 0;
  document.getElementById('missed-count').textContent = 0;
}

// Search events
function setupSearch() {
  const searchInput = document.getElementById('search-events');
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('.events .card');
    cards.forEach(card => {
      const title = card.querySelector('h2').textContent.toLowerCase();
      card.style.display = title.includes(searchTerm) ? 'block' : 'none';
    });
  });
}

// DOM Ready: Init auth and search
document.addEventListener('DOMContentLoaded', () => {
  initGoogleAuth();
  setupSearch();
});
