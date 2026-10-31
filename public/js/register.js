const form = document.getElementById("registerForm");
const message = document.getElementById("registerMessage");

const API = "https://gym-cdb7.onrender.com";

if (!form || !message) {
  console.error("Register form or message element not found.");
} else {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    message.style.color = "#d4af37";
    message.textContent = "Registering...";

    try {
      const res = await fetch(`${API}/api/members`, {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (res.ok && data.success) {
        message.style.color = "#4CAF50";
        message.textContent = "Registration successful!";

        sessionStorage.setItem(
          "gymMember",
          JSON.stringify({
            name: formData.get("name"),
            email: formData.get("email"),
            phone: formData.get("phone"),
            plan: formData.get("plan")
          })
        );

        form.reset();

        setTimeout(() => {
          window.location.href = "/dashboard.html";
        }, 1000);

      } else {
        message.style.color = "#ff4d4d";
        message.textContent = data.message || "Registration failed.";
        console.error("Registration failed:", data);
      }

    } catch (err) {
      console.error("Registration error:", err);
      message.style.color = "#ff4d4d";
      message.textContent = "Server connection failed.";
    }
  });
}