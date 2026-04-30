using System.Windows.Forms;

namespace EageSoop
{
    partial class Form1
    {
        /// <summary>
        /// 必需的设计器变量。
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// 清理所有正在使用的资源。
        /// </summary>
        /// <param name="disposing">如果应释放托管资源，为 true；否则为 false。</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows 窗体设计器生成的代码



        private System.Windows.Forms.Panel panelUrlInput;
        private System.Windows.Forms.TextBox txtUrlInput;
        private System.Windows.Forms.Button btnNavigate;
        private System.Windows.Forms.Panel panelButtons;
        private System.Windows.Forms.Button btnAddTab;
        private System.Windows.Forms.Button btnRemoveTab;
        private System.Windows.Forms.TextBox txtAgentName;
        private System.Windows.Forms.Button btnSetAgentName;
        private System.Windows.Forms.TabControl tabControl1;

        /// <summary>
        /// 设计器支持所需的方法 - 不要修改
        /// 使用代码编辑器修改此方法的内容。
        /// </summary>
        private void InitializeComponent()
        {
            this.panelUrlInput = new System.Windows.Forms.Panel();
            this.txtUrlInput = new System.Windows.Forms.TextBox();
            this.btnNavigate = new System.Windows.Forms.Button();
            this.panelButtons = new System.Windows.Forms.Panel();
            this.txtAgentName = new System.Windows.Forms.TextBox();
            this.btnSetAgentName = new System.Windows.Forms.Button();
            this.btnAddTab = new System.Windows.Forms.Button();
            this.btnRemoveTab = new System.Windows.Forms.Button();
            this.tabControl1 = new System.Windows.Forms.TabControl();
            this.panelUrlInput.SuspendLayout();
            this.panelButtons.SuspendLayout();
            this.SuspendLayout();
            // 
            // panelUrlInput
            // 
            this.panelUrlInput.BackColor = System.Drawing.Color.LightSkyBlue;
            this.panelUrlInput.Controls.Add(this.txtUrlInput);
            this.panelUrlInput.Controls.Add(this.btnNavigate);
            this.panelUrlInput.Dock = System.Windows.Forms.DockStyle.Top;
            this.panelUrlInput.Location = new System.Drawing.Point(0, 0);
            this.panelUrlInput.Name = "panelUrlInput";
            this.panelUrlInput.Padding = new System.Windows.Forms.Padding(5);
            this.panelUrlInput.Size = new System.Drawing.Size(1280, 45);
            this.panelUrlInput.TabIndex = 2;
            // 
            // txtUrlInput
            // 
            this.txtUrlInput.Dock = System.Windows.Forms.DockStyle.Fill;
            this.txtUrlInput.Font = new System.Drawing.Font("微软雅黑", 14.25F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.txtUrlInput.Location = new System.Drawing.Point(5, 5);
            this.txtUrlInput.Name = "txtUrlInput";
            this.txtUrlInput.Size = new System.Drawing.Size(1190, 39);
            this.txtUrlInput.TabIndex = 0;
            // 
            // btnNavigate
            // 
            this.btnNavigate.Dock = System.Windows.Forms.DockStyle.Right;
            this.btnNavigate.Location = new System.Drawing.Point(1195, 5);
            this.btnNavigate.Name = "btnNavigate";
            this.btnNavigate.Size = new System.Drawing.Size(80, 35);
            this.btnNavigate.TabIndex = 1;
            this.btnNavigate.Text = "Go";
            this.btnNavigate.Click += new System.EventHandler(this.BtnNavigate_Click);
            // 
            // panelButtons
            // 
            this.panelButtons.BackColor = System.Drawing.Color.LightSkyBlue;
            this.panelButtons.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.panelButtons.Controls.Add(this.txtAgentName);
            this.panelButtons.Controls.Add(this.btnSetAgentName);
            this.panelButtons.Controls.Add(this.btnAddTab);
            this.panelButtons.Controls.Add(this.btnRemoveTab);
            this.panelButtons.Dock = System.Windows.Forms.DockStyle.Top;
            this.panelButtons.Location = new System.Drawing.Point(0, 45);
            this.panelButtons.Name = "panelButtons";
            this.panelButtons.Padding = new System.Windows.Forms.Padding(5);
            this.panelButtons.Size = new System.Drawing.Size(1280, 40);
            this.panelButtons.TabIndex = 1;
            // 
            // txtAgentName
            // 
            this.txtAgentName.Location = new System.Drawing.Point(875, 6);
            this.txtAgentName.Name = "txtAgentName";
            this.txtAgentName.Size = new System.Drawing.Size(280, 27);
            this.txtAgentName.TabIndex = 2;
            // 
            // btnSetAgentName
            // 
            this.btnSetAgentName.Location = new System.Drawing.Point(1161, 5);
            this.btnSetAgentName.Name = "btnSetAgentName";
            this.btnSetAgentName.Size = new System.Drawing.Size(100, 26);
            this.btnSetAgentName.TabIndex = 3;
            this.btnSetAgentName.Text = "设置程序名称";
            this.btnSetAgentName.UseVisualStyleBackColor = true;
            this.btnSetAgentName.Click += new System.EventHandler(this.BtnSetAgentName_Click);
            // 
            // btnAddTab
            // 
            this.btnAddTab.AutoSize = true;
            this.btnAddTab.Location = new System.Drawing.Point(10, 5);
            this.btnAddTab.Name = "btnAddTab";
            this.btnAddTab.Size = new System.Drawing.Size(94, 30);
            this.btnAddTab.TabIndex = 0;
            this.btnAddTab.Text = "Add Tab";
            this.btnAddTab.Click += new System.EventHandler(this.BtnAddTab_Click);
            // 
            // btnRemoveTab
            // 
            this.btnRemoveTab.AutoSize = true;
            this.btnRemoveTab.Location = new System.Drawing.Point(110, 5);
            this.btnRemoveTab.Name = "btnRemoveTab";
            this.btnRemoveTab.Size = new System.Drawing.Size(115, 30);
            this.btnRemoveTab.TabIndex = 1;
            this.btnRemoveTab.Text = "Remove Tab";
            this.btnRemoveTab.Click += new System.EventHandler(this.BtnRemoveTab_Click);
            // 
            // tabControl1
            // 
            this.tabControl1.Dock = System.Windows.Forms.DockStyle.Fill;
            this.tabControl1.Location = new System.Drawing.Point(0, 85);
            this.tabControl1.Name = "tabControl1";
            this.tabControl1.SelectedIndex = 0;
            this.tabControl1.Size = new System.Drawing.Size(1280, 775);
            this.tabControl1.TabIndex = 0;
            // 
            // Form1
            // 
            this.ClientSize = new System.Drawing.Size(1280, 860);
            this.Controls.Add(this.tabControl1);
            this.Controls.Add(this.panelButtons);
            this.Controls.Add(this.panelUrlInput);
            this.Font = new System.Drawing.Font("微软雅黑", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.Name = "Form1";
            this.Text = "Soop Web";
            this.Load += new System.EventHandler(this.Form1_Load);
            this.panelUrlInput.ResumeLayout(false);
            this.panelUrlInput.PerformLayout();
            this.panelButtons.ResumeLayout(false);
            this.panelButtons.PerformLayout();
            this.ResumeLayout(false);

        }

        #endregion
    }
}

