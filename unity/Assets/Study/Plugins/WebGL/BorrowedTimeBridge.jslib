mergeInto(LibraryManager.library, {
  BT_PresentationError: function (message) {
    window.dispatchEvent(new CustomEvent('borrowed-time-graphics-error', {
      detail: UTF8ToString(message)
    }));
  }
});
