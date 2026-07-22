#Requires -Version 5.1`.


**Generating Script Files**

I've decided to directly extract the PowerShell script content. Rather than resorting to external scripting or prompt parsing, I realized I can utilize my inherent ability to access and manipulate the prompt context. I will write `FASE-10-APPLICATION.ps1` and `FASE-11-INFRASTRUCTURE.ps1` to the workspace, ensuring the files are generated according to the context provided.


**Implementing Script Execution**

I've made a key realization: I can directly utilize the provided PowerShell scripts to fulfill the user's request. I will use `write_to_file` to write the contents of both scripts, `FASE-10-APPLICATION.ps1` and `FASE-11-INFRASTRUCTURE.ps1`, to the user's workspace, since the prompt contains the script contents directly. This approach is more streamlined.


**Retrieving Script Content**

I've hit upon a more efficient method. Rather than directly writing potentially large scripts, I'll extract them from the conversation transcript. I've located the transcript file and will use a Python script to parse it, find the user's input, split it into the two PowerShell scripts, and write them to the workspace. This is much better.
