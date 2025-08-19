fetch('/health')
  .then(res => res.json())
  .then(data => {
    document.getElementById('status').innerText = 'API Status: ' + data.status;
  })
  .catch(err => {
    document.getElementById('status').innerText = 'Error: ' + err;
  });
