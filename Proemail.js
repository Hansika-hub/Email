// Sidebar toggle
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("show");
}

// Route via Vercel rewrite to avoid CORS
const BACKEND_URL = "/api";
let accessToken = localStorage.getItem("accessToken") || null;
let backendToken = localStorage.getItem("backendToken") || null;
let idToken = localStorage.getItem("idToken") || null;

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
      auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true,
      // Force non-FedCM behavior for prompts
      use_fedcm_for_prompt: false,
    });

    const loginButton = document.getElementById("login-button");
    if (loginButton) {
      google.accounts.id.renderButton(loginButton, {
        theme: "outline",
        size: "large",
        width: 300,
      });
      // Disable One Tap to avoid FedCM requirement; users will click the button to sign in
    }
  } catch (err) {
    console.error("GSI Initialization failed:", err);
    showError("Google Sign-In init failed.");
  }

  // Enable and wire Add Event button and modal
  initializeAddEventFlow();
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
  backendToken = null;
  idToken = null;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("backendToken");
  localStorage.removeItem("idToken");
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
    // One Tap disabled; nothing to prompt here
  } catch (err) {
    console.error("Failed to reinitialize Google Sign-In:", err);
  }
}

// Handle Google Login
function handleCredentialResponse(response) {
  const receivedIdToken = response.credential;
  // Persist the ID token in case backend needs it later
  idToken = receivedIdToken;
  localStorage.setItem("idToken", idToken);

  fetch(`${BACKEND_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      token: idToken,
      id_token: idToken,
      google_access_token: accessToken || null,
    }),
  })
    .then((res) => res.json().catch(() => null))
    .then((data) => {
      // Capture any backend-issued token if provided
      if (data && (data.sessionToken || data.token || data.accessToken || data.jwt)) {
        backendToken = data.sessionToken || data.token || data.accessToken || data.jwt;
        localStorage.setItem("backendToken", backendToken);
      }
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
    
    let res = await fetch(`${BACKEND_URL}/process_emails`, {
      method: "GET",
      credentials: "include",
      headers: {
        ...(backendToken
          ? { Authorization: `Bearer ${backendToken}` }
          : accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {}),
        ...(idToken ? { "X-ID-Token": idToken } : {}),
      },
    });

    // If unauthorized, try to refresh Google access token silently (if using it)
    if (res.status === 401 && !backendToken && accessToken) {
      try {
        await new Promise((resolve, reject) => {
          try {
            google.accounts.oauth2
              .initTokenClient({
                client_id: "721040422695-9m0ge0d19gqaha28rse2le19ghran03u.apps.googleusercontent.com",
                scope: "https://www.googleapis.com/auth/gmail.readonly",
                callback: (tokenResponse) => {
                  accessToken = tokenResponse.access_token;
                  localStorage.setItem("accessToken", accessToken);
                  resolve();
                },
              })
              .requestAccessToken({ prompt: "" });
          } catch (e) {
            reject(e);
          }
        });

        // retry once with refreshed token
        res = await fetch(`${BACKEND_URL}/process_emails`, {
          method: "GET",
          credentials: "include",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch (refreshErr) {
        console.error("Silent token refresh failed:", refreshErr);
      }
    }

    // Fallback to POST if backend doesn't allow GET (405 Method Not Allowed)
    if (res.status === 405) {
      try {
        res = await fetch(`${BACKEND_URL}/process_emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(backendToken
              ? { Authorization: `Bearer ${backendToken}` }
              : accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : {}),
          },
          credentials: "include",
          body: JSON.stringify(
            idToken
              ? {
                  token: idToken,
                  id_token: idToken,
                  google_access_token: accessToken || null,
                }
              : {}
          ),
        });
      } catch (postErr) {
        console.error("POST fallback failed:", postErr);
      }
    }

    // If still unauthorized, try POST explicitly with idToken in body and all auth headers
    if (res.status === 401 && idToken) {
      try {
        res = await fetch(`${BACKEND_URL}/process_emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(backendToken
              ? { Authorization: `Bearer ${backendToken}` }
              : accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : {}),
            ...(idToken ? { "X-ID-Token": idToken } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            token: idToken,
            id_token: idToken,
            google_access_token: accessToken || null,
          }),
        });
      } catch (finalPostErr) {
        console.error("Explicit POST with idToken failed:", finalPostErr);
      }
    }

    // Final fallback: send ID token as Bearer Authorization explicitly
    if (res.status === 401 && idToken) {
      try {
        res = await fetch(`${BACKEND_URL}/process_emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          credentials: "include",
          body: JSON.stringify({
            token: idToken,
            id_token: idToken,
            google_access_token: accessToken || null,
          }),
        });
      } catch (authIdBearerErr) {
        console.error("POST with Authorization: Bearer <idToken> failed:", authIdBearerErr);
      }
    }

    if (!res.ok) {
      let errorText = "";
      try {
        errorText = await res.text();
      } catch (_) {}
      throw new Error(`HTTP ${res.status}: ${res.statusText}${errorText ? ` - ${errorText}` : ""}`);
    }

    const allEvents = await res.json();
    
    // Clear any previous errors
    emailError.style.display = "none";
    
    renderEvents(allEvents);
    updateSummary(allEvents);
    scheduleNotifications(allEvents);

  } catch (err) {
    console.error("Fetching emails failed:", err);
    showError(`Failed to fetch emails. ${err && err.message ? err.message : ""}`);
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
  const deleted = JSON.parse(localStorage.getItem("deletedEvents") || "[]");

  // Filter out deleted events
  const filteredEvents = (events || []).filter((ev) => !deleted.includes(ev.event_name));

  filteredEvents.forEach((event) => {
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

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.type = "button";
    deleteBtn.title = "Delete event";
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", () => handleDeleteEvent(event, card));

    card.innerHTML = `
      <div style="color: #8b5cf6; font-weight: bold;">${event.type || "Event"}</div>
      <h2>${event.event_name || "No Title"}</h2>
      <p>📅 ${event.date || "N/A"}</p>
      <p>⏰ ${event.time || "N/A"}</p>
      <p>📍 ${event.venue || "N/A"}</p>
    `;

    card.prepend(checkbox);
    card.appendChild(deleteBtn);
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

// Handle deleting an event card
function handleDeleteEvent(event, cardElement) {
  try {
    if (event && event.isCustom) {
      const existing = JSON.parse(localStorage.getItem("customEvents") || "[]");
      const updated = existing.filter((ev) => ev.event_name !== event.event_name);
      localStorage.setItem("customEvents", JSON.stringify(updated));
    } else if (event && event.event_name) {
      const deleted = new Set(JSON.parse(localStorage.getItem("deletedEvents") || "[]"));
      deleted.add(event.event_name);
      localStorage.setItem("deletedEvents", JSON.stringify([...deleted]));
    }

    if (cardElement && cardElement.remove) {
      cardElement.remove();
    }

    // Re-render to refresh counts and ensure consistency
    if (accessToken) {
      fetchAllUnreadEmails();
    } else {
      const merged = getAllEventsWithCustom([]);
      renderEvents(merged);
      updateSummary(merged);
    }
  } catch (err) {
    console.error("Failed to delete event:", err);
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

// Merge fetched events with user-added custom events from localStorage
function getAllEventsWithCustom(fetchedEvents) {
  const custom = JSON.parse(localStorage.getItem("customEvents") || "[]");
  return [...custom, ...fetchedEvents];
}

// Initialize Add Event modal flow
function initializeAddEventFlow() {
  const addBtn = document.getElementById("add-event-btn");
  const modal = document.getElementById("add-event-modal");
  const cancelBtn = document.getElementById("cancel-add-event");
  const form = document.getElementById("add-event-form");

  if (!addBtn || !modal || !cancelBtn || !form) return;

  // Ensure button is enabled and styled
  addBtn.removeAttribute("disabled");

  const openModal = () => {
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    form.reset();
  };

  addBtn.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("event-name").value.trim();
    const type = document.getElementById("event-type").value.trim();
    const date = document.getElementById("event-date").value;
    const time = document.getElementById("event-time").value;
    const venue = document.getElementById("event-venue").value.trim();

    if (!name || !date || !time) {
      alert("Please fill in the required fields: name, date, time.");
      return;
    }

    const newEvent = {
      event_name: name,
      type: type || "Custom",
      date,
      time,
      venue: venue || "",
      isCustom: true,
    };

    const existing = JSON.parse(localStorage.getItem("customEvents") || "[]");
    existing.unshift(newEvent);
    localStorage.setItem("customEvents", JSON.stringify(existing));

    // Re-render events combining custom + fetched if logged in, else just custom
    if (accessToken) {
      // Attempt to merge with latest fetched events by reusing the last known list on the page
      // If we don't have it, just render custom for now; next fetch will merge
      const currentCards = document.querySelectorAll("#events-list .card h2");
      const currentEventNames = Array.from(currentCards).map((h) => h.textContent);
      // No reliable reconstruction of fetched event objects here; trigger a refetch if logged in
      fetchAllUnreadEmails();
    } else {
      renderEvents(getAllEventsWithCustom([]));
      updateSummary(getAllEventsWithCustom([]));
    }

    // Optional: schedule notification for the custom event
    scheduleNotifications([newEvent]);

    closeModal();
  });
}

// Override render pipeline to include custom events when we fetch
const originalRenderEvents = renderEvents;
renderEvents = function(events) {
  const merged = getAllEventsWithCustom(events || []);
  originalRenderEvents(merged);
};

// Override updateSummary to use combined list and exclude deleted events
const originalUpdateSummary = updateSummary;
updateSummary = function(events) {
  const merged = getAllEventsWithCustom(events || []);
  const deleted = JSON.parse(localStorage.getItem("deletedEvents") || "[]");
  const filtered = merged.filter((ev) => !deleted.includes(ev.event_name));
  originalUpdateSummary(filtered);
};


