function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("show");
}

const BACKEND_URL = "https://email-backend-bu9l.onrender.com";
let accessToken = null;
let tokenClient = null;

async function handleCredentialResponse(response) {
  const idToken = response.credential;

  try {
    const res = await fetch(`${BACKEND_URL}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: idToken }),
      credentials: "include"
    });

    if (!res.ok) throw new Error(`ID token verification failed: ${await res.text()}`);
    const data = await res.json();

    localStorage.setItem("userEmail", data.user);
    localStorage.setItem("lastLogin", Date.now().toString());

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
      scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      prompt: "consent",
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          console.error("Access token error:", tokenResponse.error);
          showError("Authentication failed. Please try again.");
          return;
        }

        accessToken = tokenResponse.access_token;
        localStorage.setItem("accessToken", accessToken);

        // Store refresh token if present
        if (tokenResponse.refresh_token) {
          try {
            const storeRes = await fetch(`${BACKEND_URL}/store-tokens`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userEmail: localStorage.getItem("userEmail"),
                refreshToken: tokenResponse.refresh_token,
              }),
            });
            if (!storeRes.ok) console.error("Failed to store refresh token:", await storeRes.text());
          } catch (err) {
            console.error("Failed to store refresh token:", err);
          }
        }

        showLogout();
        startTokenRefreshInterval();

        try {
          const emails = await fetchEmails();
          await processAllEmails(emails, 1);
        } catch (err) {
          console.error("Initial email fetch failed:", err);
          showError("Failed to load emails. Please try again later.");
        }
      },
    });

    tokenClient.requestAccessToken();
  } catch (err) {
    console.error("Login failed:", err);
    showError("Login failed. Please try again.");
  }
}

function startTokenRefreshInterval() {
  setInterval(() => {
    if (tokenClient && localStorage.getItem("userEmail")) {
      tokenClient.requestAccessToken();
    }
  }, 30 * 60 * 1000);
}

async function fetchEmails(retries = 3, delay = 1000) {
  const emailError = document.getElementById("email-error");
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const userEmail = localStorage.getItem("userEmail");
      const res = await fetch(`${BACKEND_URL}/fetch_emails`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "X-User-Email": userEmail,
        },
        credentials: "include",
      });

      if (res.status === 401) {
        showError("Session expired. Please log in again.");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("lastLogin");
        showLogin();
        return [];
      }

      if (!res.ok) throw new Error(`Email fetch failed: ${await res.text()}`);
      return await res.json();
    } catch (err) {
      console.error(`Fetch emails attempt ${attempt} failed:`, err);
      if (attempt === retries) {
        showError("Failed to fetch emails after multiple attempts.");
        return [];
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function processAllEmails(emails, limit = 1) {
  const eventsList = document.getElementById("events-list");
  const processedEmails = new Set();
  let count = 0;

  for (let email of emails) {
    if (count >= limit) break;
    if (processedEmails.has(email.id)) continue;
    processedEmails.add(email.id);

    try {
      const res = await fetch(`${BACKEND_URL}/process_emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ emailId: email.id }),
        credentials: "include",
      });

      if (res.status === 401) {
        showError("Session expired. Please log in again.");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("lastLogin");
        showLogin();
        return;
      }

      if (!res.ok) throw new Error(`Event extraction failed: ${await res.text()}`);
      const events = await res.json();

      if (events.length > 0) {
        for (let event of events) {
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

          try {
            const response = await fetch(`${BACKEND_URL}/add_to_calendar`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(event),
              credentials: "include",
            });

            if (response.ok) {
              const statusDiv = document.createElement("div");
              statusDiv.textContent = "✅ Added to Calendar";
              statusDiv.style.color = "green";
              statusDiv.style.fontSize = "0.9rem";
              statusDiv.style.marginTop = "5px";
              statusDiv.style.fontWeight = "bold";
              card.appendChild(statusDiv);
            } else {
              console.error("❌ Failed to add to calendar:", await response.text());
            }
          } catch (calendarErr) {
            console.error("❌ Calendar add failed:", calendarErr);
          }
        }
        updateSummary(events);
      }
      count++;
    } catch (err) {
      console.error(`Error processing email ${email.id}:`, err);
      continue;
    }
  }

  console.log(`✅ Processed ${count} email(s) for events`);
}

/**
 * Fetch all persisted events from the backend and render them
 */
async function fetchAllEvents() {
  const eventsList = document.getElementById("events-list");
  eventsList.innerHTML = "";

  try {
    const res = await fetch(`${BACKEND_URL}/events`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "X-User-Email": localStorage.getItem("userEmail"),
      },
      credentials: "include"
    });

    if (!res.ok) throw new Error(`Failed to load events: ${await res.text()}`);
    const events = await res.json();
    renderEvents(events);
  } catch (err) {
    console.error("❌ fetchAllEvents error:", err);
  }
}

/**
 * Render events array into cards and update summary
 */
function renderEvents(events) {
  const eventsList = document.getElementById("events-list");
  eventsList.innerHTML = "";

  for (let event of events) {
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
  }
  updateSummary(events);
}

async function fetchEvents(emailId) { /* unchanged */ }
function updateSummary(events) { /* unchanged */ }
function setupSearch() { /* unchanged */ }
function showError(message) { /* unchanged */ }

window.onload = function () {
  setupSearch();

  const userEmail        = localStorage.getItem("userEmail");
  const lastLogin        = parseInt(localStorage.getItem("lastLogin") || "0");
  const savedAccessToken = localStorage.getItem("accessToken");

  if (userEmail && savedAccessToken && Date.now() - lastLogin < 7 * 24 * 60 * 60 * 1000) {
    accessToken = savedAccessToken;
    showLogout();

    tokenClient = google.accounts.oauth2.initTokenClient({ /* unchanged */ });
    startTokenRefreshInterval();

    // process new unread emails
    fetchEmails().then(emails => processAllEmails(emails, 1));
    // then load and render all persisted events
    fetchAllEvents();
  } else {
    google.accounts.id.initialize({ /* unchanged */ });
    google.accounts.id.renderButton(/* unchanged */);
    google.accounts.id.prompt();
    showLogin();
  }

  document.getElementById("logoutButton").addEventListener("click", () => { /* unchanged */ });
};

function showLogin() { /* unchanged */ }
function showLogout() { /* unchanged */ }
