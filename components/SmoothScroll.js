export function scrollToSection(e) {
  e.preventDefault();
  const targetId = e.target.getAttribute('href').substring(1); // Remove the # from the href
  const targetSection = document.getElementById(targetId);

  if (targetSection) {
    const menuBar = document.querySelector('.menu-bar'); // Adjust the selector to match your menu bar container element
    const offset = menuBar ? menuBar.offsetHeight : 0; // Get the height of the menu bar container

    // Calculate the scroll position to align with the section's heading
    const scrollPosition = targetSection.offsetTop - offset;

    // Manually adjust the number of pixels you want to scroll by
    const scrollToPosition = scrollPosition - 100; // Adjust as needed

    window.scrollTo({
      top: scrollToPosition,
      behavior: 'smooth',
    });
  }
}
