// Study settings (loaded before common.js). ENDPOINT_URL: Google Apps Script web app (.../exec); every answer is POSTed there
// as text/plain JSON {secret, study, rater, rows:[{id, ...}]}; an answer counts as saved only on a readable {ok:true} reply.
// STUDY = the sheet tab. ?study=test... (names starting with 'test' only) sends to a test tab instead.
window.STUDY_CONFIG = {
  ENDPOINT_URL: "https://script.google.com/macros/s/AKfycbzhFomNoUuUoL94lp9omxvXJcLNCvS8GzZFud3iL46SoRLfcOoX8KZJ9CFSgnBKqRzk6w/exec",
  ENDPOINT_SECRET: "dfsjdfjdsfhdjhasfndsfdkfdk",
  STUDY: "study_v1",
  FORMS_VERSION: 3,
  ENDPOINT_NO_CORS: false
};
