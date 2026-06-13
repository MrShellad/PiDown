fetch("https://cdn.syndication.twimg.com/tweet-result?id=2065614907425591681")
  .then(res => {
    console.log("Status:", res.status);
    return res.json();
  })
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(err => console.error(err));
