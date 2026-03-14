Component({
  properties: {
    // 标题
    title: {
      type: String,
      value: '上传图片'
    },
    // 提示文字
    hint: {
      type: String,
      value: '点击上传'
    },
    // 已上传的图片路径
    image: {
      type: String,
      value: ''
    },
    // 图片填充模式
    mode: {
      type: String,
      value: 'aspectFill'
    },
    // 是否禁用
    disabled: {
      type: Boolean,
      value: false
    },
    // 是否显示删除按钮
    showDelete: {
      type: Boolean,
      value: true
    }
  },

  data: {},

  methods: {
    onUpload() {
      if (this.data.disabled) return;
      if (this.data.image) return; // 已有图片，不触发上传

      this.triggerEvent('upload');
    },

    onDelete(e) {
      e.stopPropagation();
      this.triggerEvent('delete');
    },

    onPreview() {
      if (this.data.image) {
        wx.previewImage({
          current: this.data.image,
          urls: [this.data.image]
        });
      }
    }
  }
});