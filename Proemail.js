// Sidebar toggle
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("show");
}

const BACKEND_URL = "https://email-backend-bu9l.onrender.com";
let accessToken = localStorage.getItem("accessToken") || null;

// On load, fetch events if already logged in
window.onload = function () {
  setupSearch();
  updateLoginUI(); // Update UI based on login state

  if (accessToken) {
    fetchAllUnreadEmails();
  }

  try {
    google.accounts.id.initialize({
      client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
      callback: handleCredentialResponse,
      auto_select: true,
      cancel_on_tap_outside: true,
      itp_support: true,
    });

    const loginButton = document.getElementById("login-button");
    if (loginButton) {
      google.accounts.id.renderButton(loginButton, {
        theme: "outline",
        size: "large",
        width: 300,
      });
      google.accounts.id.prompt(); // optional One Tap
    }
  } catch (err) {
    console.error("GSI Initialization failed:", err);
    showError("Google Sign-In init failed.");
  }
};

// Update login/logout UI based on authentication state
function updateLoginUI() {
  const loginDiv = document.getElementById("loginDiv");
  const logoutButton = document.getElementById("logoutButton");
  
  if (accessToken) {
    // User is logged in
    if (loginDiv) loginDiv.style.display = "none";
    if (logoutButton) logoutButton.style.display = "block";
  } else {
    // User is not logged in
    if (loginDiv) loginDiv.style.display = "block";
    if (logoutButton) logoutButton.style.display = "none";
  }
}

// Handle logout
function logout() {
  accessToken = null;
  localStorage.removeItem("accessToken");
  updateLoginUI();
  
  // Clear all data
  document.getElementById("events-list").innerHTML = "";
  document.getElementById("email-list").innerHTML = "";
  document.getElementById("email-error").style.display = "none";
  
  // Reset counters
  document.getElementById("total-events").textContent = "0";
  document.getElementById("this-week-events").textContent = "0";
  document.getElementById("total-attendees").textContent = "0";
  document.getElementById("upcoming-count").textContent = "0";
  document.getElementById("attended-count").textContent = "0";
  document.getElementById("missed-count").textContent = "0";
  
  // Reinitialize Google Sign-In
  try {
    google.accounts.id.prompt();
  } catch (err) {
    console.error("Failed to reinitialize Google Sign-In:", err);
  }
}

// Handle Google Login
function handleCredentialResponse(response) {
  const idToken = response.credential;

  fetch(`${BACKEND_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: idToken }),
  })
    .then((res) => res.json())
    .then(() => {
      google.accounts.oauth2.initTokenClient({
        client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        callback: (tokenResponse) => {
          accessToken = tokenResponse.access_token;
          localStorage.setItem("accessToken", accessToken);
          updateLoginUI(); // Update UI after successful login
          fetchAllUnreadEmails();
        },
      }).requestAccessToken();
    })
    .catch((err) => {
      console.error("Login failed:", err);
      showError("Login failed. Try again.");
    });
}

// Fetch all unread emails and extract events
async function fetchAllUnreadEmails() {
  try {
    // Show loading state
    const emailError = document.getElementById("email-error");
    emailError.style.display = "none";
    
    const res = await fetch(`${BACKEND_URL}/process_emails`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const allEvents = await res.json();
    
    // Clear any previous errors
    emailError.style.display = "none";
    
    renderEvents(allEvents);
    updateSummary(allEvents);
    scheduleNotifications(allEvents);

  } catch (err) {
    console.error("Fetching emails failed:", err);
    showError("Failed to fetch emails.");
  }
}


// Extract events from one email
// async function fetchEvents(emailId) {
//   try {
//     const res = await fetch(`${BACKEND_URL}/process_emails`, {
//       method: "POST",
//       method: "GET",
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Bearer ${accessToken}`,
//       },
//       body: JSON.stringify({ emailId }),
//     });

//     if (!res.ok) return [];

//     return await res.json();
//   } catch (err) {
//     console.error(`Error processing email ${emailId}:`, err);
//     return [];
//   }
// }

// Render events with checkbox
function renderEvents(events) {
  const list = document.getElementById("events-list");
  list.innerHTML = "";

  const now = new Date();
  const completed = JSON.parse(localStorage.getItem("completedEvents") || "[]");

  events.forEach((event) => {
    let eventTime = null;
    if (event.date && event.time) {
      try {
        eventTime = new Date(`${event.date} ${event.time}`);
      } catch (err) {
        console.error("Invalid date format:", event.date, event.time);
      }
    }
    
    const isCompleted = completed.includes(event.event_name);

    const card = document.createElement("div");
    card.className = "card";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isCompleted;
    checkbox.addEventListener("change", () => handleStatusChange(event, checkbox.checked));

    card.innerHTML = `
      <div style="color: #8b5cf6; font-weight: bold;">${event.type || "Event"}</div>
      <h2>${event.event_name || "No Title"}</h2>
      <p>📅 ${event.date || "N/A"}</p>
      <p>⏰ ${event.time || "N/A"}</p>
      <p>📍 ${event.venue || "N/A"}</p>
    `;

    card.prepend(checkbox);
    list.appendChild(card);
  });
}

// Handle marking event as complete
function handleStatusChange(event, isComplete) {
  const completed = new Set(JSON.parse(localStorage.getItem("completedEvents") || "[]"));
  if (isComplete) completed.add(event.event_name);
  else completed.delete(event.event_name);

  localStorage.setItem("completedEvents", JSON.stringify([...completed]));
  
  // Re-fetch events to update everything
  if (accessToken) {
    fetchAllUnreadEmails();
  }
}

// Setup event search
function setupSearch() {
  const input = document.getElementById("search-events");
  input.addEventListener("input", (e) => {
    const val = e.target.value.toLowerCase();
    const cards = document.querySelectorAll(".events .card");
    cards.forEach((c) => {
      const title = c.querySelector("h2").textContent.toLowerCase();
      c.style.display = title.includes(val) ? "block" : "none";
    });
  });
}

// Notification scheduler
function scheduleNotifications(events) {
  if (!("Notification" in window)) return;

  Notification.requestPermission().then((permission) => {
    if (permission !== "granted") return;

    events.forEach((event) => {
      const dateTimeStr = `${event.date} ${event.time}`;
      const eventTime = new Date(dateTimeStr);
      const now = new Date();

      const times = [60, 15, 5]; // minutes before
      times.forEach((min) => {
        const delay = eventTime - now - min * 60 * 1000;
        if (delay > 0) {
          setTimeout(() => {
            new Notification(`Upcoming Event: ${event.event_name}`, {
              body: `📍 ${event.venue || "Unknown"}\n⏰ ${event.time || "Unknown"}`,
              icon: "/favicon.png",
            });
          }, delay);
        }
      });
    });
  });
}

// Update dashboard summary
function updateSummary(events) {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const total = events.length;
  const completedEvents = JSON.parse(localStorage.getItem("completedEvents") || "[]");
  
  // Calculate this week events
  const thisWeek = events.filter((ev) => {
    if (!ev.date || !ev.time) return false;
    try {
      const dt = new Date(`${ev.date} ${ev.time}`);
      return dt >= weekStart && dt <= weekEnd;
    } catch (err) {
      return false;
    }
  }).length;

  // Calculate completed, missed, and upcoming
  const completed = completedEvents.length;
  const missed = events.filter((ev) => {
    if (!ev.date || !ev.time) return false;
    try {
      const dt = new Date(`${ev.date} ${ev.time}`);
      return dt < today && !completedEvents.includes(ev.event_name);
    } catch (err) {
      return false;
    }
  }).length;
  const upcoming = total - completed - missed;

  // Update all counters
  document.getElementById("total-events").textContent = total;
  document.getElementById("this-week-events").textContent = thisWeek;
  document.getElementById("total-attendees").textContent = completed; // Total attendees = completed events
  document.getElementById("upcoming-count").textContent = Math.max(0, upcoming);
  document.getElementById("attended-count").textContent = completed;
  document.getElementById("missed-count").textContent = Math.max(0, missed);
}

// Error handler
function showError(message) {
  const errBox = document.getElementById("email-error");
  errBox.style.display = "block";
  errBox.textContent = message;
}


