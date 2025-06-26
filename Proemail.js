const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const menuToggle = document.getElementById('menu-toggle');

menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('active');
  overlay.classList.toggle('show');
});

overlay.addEventListener('click', () => {
  sidebar.classList.remove('active');
  overlay.classList.remove('show');
});

document.getElementById('loginBtn').onclick = () => alert('Login Clicked');
document.getElementById('signupBtn').onclick = () => alert('Signup Clicked');
