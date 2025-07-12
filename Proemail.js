// Sidebar toggle
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("show");
}

const BACKEND_URL = "https://email-backend-bu9l.onrender.com";
let accessToken = null;
let tokenClient = null; // 🔁 For refresh token reuse

// Handle login success (from Google One Tap or button)
function handleCredentialResponse(response) {
  const idToken = response.credential;

  // Send ID token to backend to verify and save session
  fetch(`${BACKEND_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: idToken }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("ID token verification failed");
      return res.json();
    })
    .then((data) => {
      const email = data.user;

      // ✅ Save login metadata in localStorage
      localStorage.setItem("userEmail", email);
      localStorage.setItem("lastLogin", Date.now().toString());

      // Request Gmail access token
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        callback: (tokenResponse) => {
          if (tokenResponse.error) throw new Error("Access token error");

          accessToken = tokenResponse.access_token;

          // ✅ Store the access token
          localStorage.setItem("accessToken", accessToken);

          // ✅ Update UI
          showLogout();

          // ✅ Start refresh interval
          startTokenRefreshInterval();

          // ✅ Fetch emails
          fetchEmails();
        }
      });

      tokenClient.requestAccessToken(); // Trigger initial login
    })
    .catch((err) => {
      console.error("Login failed:", err);
      const errBox = document.getElementById("email-error");
      errBox.style.display = "block";
      errBox.textContent = "Login failed. Try again.";
    });
}

// 🔁 Refresh Gmail access token every 55 mins
function startTokenRefreshInterval() {
  setInterval(() => {
    if (tokenClient && localStorage.getItem("userEmail")) {
      tokenClient.requestAccessToken(); // silent refresh
    }
  }, 55 * 60 * 1000);
}

// Fetch Emails from backend
async function fetchEmails() {
  const emailList = document.getElementById("email-list");
  const emailLoading = document.getElementById("email-loading");
  const emailError = document.getElementById("email-error");

  emailLoading.style.display = "block";
  emailError.style.display = "none";

  try {
    const res = await fetch(`${BACKEND_URL}/fetch_emails`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) throw new Error("Email fetch failed");

    const emails = await res.json();
    emailList.innerHTML = "";

    emails.forEach((email) => {
      const div = document.createElement("div");
      div.className = "email-item";
      div.textContent = email.subject || "No Subject";
      div.addEventListener("click", () => fetchEvents(email.id));
      emailList.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    emailError.style.display = "block";
    emailError.textContent = "Failed to fetch emails.";
  } finally {
    emailLoading.style.display = "none";
  }
}

// Extract events from a selected email
async function fetchEvents(emailId) {
  const eventsList = document.getElementById("events-list");
  const eventsLoading = document.getElementById("events-loading");
  const eventsError = document.getElementById("events-error");

  eventsLoading.style.display = "block";
  eventsError.style.display = "none";

  try {
    const res = await fetch(`${BACKEND_URL}/process_emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ emailId }),
    });

    if (!res.ok) throw new Error("Event extraction failed");

    const events = await res.json();
    eventsList.innerHTML = "";

    events.forEach((event) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div style="color: #8b5cf6; font-weight: bold;">${event.type || "Event"}</div>
        <h2>${event.event_name || "No Title"}</h2>
        <p>📅 ${event.date || "N/A"}</p>
        <p>⏰ ${event.time || "N/A"}</p>
        <p>📍 ${event.venue || "N/A"}</p>
      `;
      eventsList.appendChild(card);
    });

    updateSummary(events);
  } catch (err) {
    console.error(err);
    eventsError.style.display = "block";
    eventsError.textContent = "No events found for this email.";
  } finally {
    eventsLoading.style.display = "none";
  }
}

// Update event dashboard
function updateSummary(events) {
  const total = events.length;
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const thisWeek = events.filter((ev) => {
    const dt = new Date(ev.date);
    return dt >= weekStart && dt <= weekEnd;
  }).length;

  const attendees = events.reduce(
    (sum, ev) => sum + (parseInt(ev.attendees) || 0),
    0
  );

  document.getElementById("total-events").textContent = total;
  document.getElementById("this-week-events").textContent = thisWeek;
  document.getElementById("total-attendees").textContent = attendees;
  document.getElementById("upcoming-count").textContent = total;
  document.getElementById("attended-count").textContent = 0;
  document.getElementById("missed-count").textContent = 0;
}

// Search event cards
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

// Init Google Sign-In & handle auto-login
window.onload = function () {
  setupSearch();

  const userEmail = localStorage.getItem("userEmail");
  const lastLogin = parseInt(localStorage.getItem("lastLogin") || "0");
  const savedAccessToken = localStorage.getItem("accessToken");

  // Reuse accessToken if within 7 days and refresh it every 55 mins
  if (userEmail && savedAccessToken && Date.now() - lastLogin < 7 * 24 * 60 * 60 * 1000) {
    accessToken = savedAccessToken;

    // Show Logout button since user is considered logged in
    showLogout();

    // Re-initialize token client for refresh
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      callback: (tokenResponse) => {
        accessToken = tokenResponse.access_token;
        localStorage.setItem("accessToken", accessToken);
      }
    });

    // Refresh access token every 55 minutes
    startTokenRefreshInterval();

    // Fetch emails automatically on page load
    fetchEmails();
  } else {
    // Fresh login required
    google.accounts.id.initialize({
      client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
      callback: handleCredentialResponse,
      auto_select: false,
    });

    google.accounts.id.renderButton(document.getElementById("login-button"), {
      theme: "outline",
      size: "large",
      width: 300,
    });

    google.accounts.id.prompt(); // Optional One Tap
    showLogin(); // Show login if not already authenticated
  }

  // ✅ Proper logout functionality
  document.getElementById("logoutButton").addEventListener("click", () => {
  const email = localStorage.getItem("userEmail");

  // Clear stored login info
  localStorage.removeItem("accessToken");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("lastLogin");
  accessToken = null;

  // Clear UI
  document.getElementById("events-list").innerHTML = "";
  document.getElementById("email-list").innerHTML = "";
  document.getElementById("total-events").textContent = 0;
  document.getElementById("this-week-events").textContent = 0;
  document.getElementById("total-attendees").textContent = 0;
  document.getElementById("upcoming-count").textContent = 0;
  document.getElementById("attended-count").textContent = 0;
  document.getElementById("missed-count").textContent = 0;

  showLogin();

  // 🧠 Re-render the login button
  google.accounts.id.initialize({
    client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
    callback: handleCredentialResponse,
    auto_select: false,
  });

  google.accounts.id.renderButton(document.getElementById("login-button"), {
    theme: "outline",
    size: "large",
    width: 300,
  });

  // Optional: revoke Google session too
  if (email) {
    google.accounts.id.revoke(email, () => {
      console.log("✅ Google session revoked");
    });
  }
});



// UI Utility Functions
function showLogin() {
  document.getElementById("loginDiv").style.display = "block";
  document.getElementById("logoutButton").style.display = "none";
}

function showLogout() {
  document.getElementById("loginDiv").style.display = "none";
  document.getElementById("logoutButton").style.display = "inline-block";
}
